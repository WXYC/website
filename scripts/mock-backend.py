#!/usr/bin/env python3
"""Stand-in Backend-Service for previewing the public playlist pages locally.

The three playlist surfaces (/playlist, /airplay-search, /playlists/archive)
read api.wxyc.org from the browser, and that origin's CORS allowlist does not
include localhost -- a dev server gets `Access-Control-Allow-Origin:
https://dj.wxyc.org` back and the browser drops the response, so every page
renders its error state. This serves the same three endpoints from localhost
with permissive CORS and realistic row density, so the pages can be looked at
with content in them.

Read-only and bound to 127.0.0.1. It invents its data; it never touches a
real database.

Usage:

    python3 scripts/mock-backend.py [--port 8899]

    # in another terminal
    NEXT_PUBLIC_WXYC_API_URL=http://127.0.0.1:8899 npm run dev

Endpoints, matching the envelopes in wxyc-shared/api.yaml:

    GET /flowsheet?page=&limit=          -> live playlist  (pages/playlist.jsx)
    GET /flowsheet?shows_limit=1&page=   -> one whole set  (pages/playlist.jsx)
    GET /flowsheet/search?q=&page=&limit=
                                         -> airplay search (pages/airplay-search.jsx)
    GET /flowsheet/range?start=&end=     -> week archive   (pages/playlists/archive.jsx)

The `shows_limit` branch deliberately reproduces two things about the real one
that a naive mock would smooth over, because both drive UI the pages cannot
otherwise be seen to handle: it answers with a bare array rather than the
`{entries, total, page, ...}` envelope, and it answers 404 for a set with no
rows. Set 3 is empty on purpose so the mid-archive case is reachable, and so
is anything past MOCK_SET_COUNT, so the past-the-end case is too -- those two
are indistinguishable to the endpoint, which is exactly the point the page's
handling turns on.

Two bugs this file has already been responsible for, both worth not
reintroducing. Its search ignored `q` entirely and returned everything, which
made the empty, counted and paginated states unreachable in preview -- the
parts of that page most likely to be wrong were the parts you could not look
at. And its 404 went out without CORS headers, because
BaseHTTPRequestHandler.send_error composes its own response; the browser then
refuses to hand the response to fetch at all, so a page that carefully
distinguishes "this set is empty" from "the request failed" could only ever
show the second. CORS is attached in end_headers now, which covers every
response including errors, as the real service does.

Artists come from the org's canonical WXYC example data (see the "Example
Music Data" section of WXYC/CLAUDE.md) rather than mainstream placeholders,
including the three diacritic-bearing names, so the pages get exercised
against the text they will really render.
"""

import argparse
import json
import logging
import random
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

LOG = logging.getLogger("mock-backend")

# (artist, track, album, label)
ARTISTS = [
    ("Juana Molina", "la paradoja", "DOGA", "Sonamos"),
    ("Jessica Pratt", "Back, Baby", "On Your Own Love Again", "Drag City"),
    ("Chuquimamani-Condori", "Call Your Name", "Edits", "self-released"),
    (
        "Duke Ellington & John Coltrane",
        "In a Sentimental Mood",
        "Duke Ellington & John Coltrane",
        "Impulse Records",
    ),
    ("Stereolab", "Metronomic Underground", "Emperor Tomato Ketchup", "Duophonic"),
    ("Cat Power", "Cross Bones Style", "Moon Pix", "Matador"),
    ("Nilüfer Yanya", "Stabilise", "PAINLESS", "ATO"),
    ("Hermanos Gutiérrez", "El Bueno Y El Malo", "El Bueno Y El Malo", "Easy Eye Sound"),
    ("Csillagrablók", "Kék Sziget", "Napfogyatkozás", "Bahia"),
    ("Sun Ra Arkestra", "Space Is the Place", "Living Sky", "Omni Sound"),
]

# The RotationBin enum from wxyc-shared/api.yaml -- H=Heavy, M=Medium,
# L=Light, S=Single -- plus the None a playcut outside rotation carries.
# Weighted to roughly match production: of the 200 most recent flowsheet
# entries on 2026-09-11, 96 of 152 tracks had no bin at all.
BINS = [None, None, None, None, None, "L", "H", "M", "S"]

# How far back ``?shows_limit=1`` will serve before answering 404.
MOCK_SET_COUNT = 8

MOCK_SET_DJS = ["DJ Biscuit", "DJ Starcross", "stink", "DJ Parsley"]
DJS = ["DJ Biscuit", "DJ Ivy", "DJ Jubilee", "DJ uumi", "Unknown DJ"]

# The live endpoint's real magnitudes, so pagination copy reads plausibly.
TOTAL_ROWS = 2634069
TOTAL_PAGES = 52682
# The backend's COUNT_CAP sentinel: any search matching more rows reports
# exactly this, which is what formatSearchTotal renders as "10,000+".
SEARCH_COUNT_SENTINEL = 10001


def _iso(moment):
    return moment.isoformat().replace("+00:00", "Z")


def track_entry(index, show_id, play_order, aired_at):
    artist, title, album, label = ARTISTS[index % len(ARTISTS)]
    return {
        "id": 500000 + index,
        "show_id": show_id,
        "play_order": play_order,
        "add_time": _iso(aired_at),
        "entry_type": "track",
        "artist_name": artist,
        "track_title": title,
        "album_title": album,
        "record_label": label,
        "rotation_bin": BINS[index % len(BINS)],
        "request_flag": index % 7 == 0,
    }


def recent_flowsheet(limit):
    """GET /flowsheet -- newest-first entries plus who is on the air."""
    now = datetime.now(timezone.utc)
    entries = []
    for i in range(limit):
        aired_at = now - timedelta(minutes=4 * i)
        if i % 12 == 11:
            # A non-track row, so the page's describeNonTrackEntry path renders.
            entries.append(
                {
                    "id": 500000 + i,
                    "show_id": 1950477,
                    "play_order": limit - i,
                    "add_time": _iso(aired_at),
                    "entry_type": "talkset",
                    "message": "TALKSET",
                }
            )
        else:
            entries.append(track_entry(i, 1950477, limit - i, aired_at))
    return {
        "entries": entries,
        "total": TOTAL_ROWS,
        "page": 0,
        "limit": limit,
        "totalPages": TOTAL_PAGES,
        "on_air": {"dj_name": "DJ Biscuit"},
    }


def one_set(page):
    """GET /flowsheet?shows_limit=1&page=N -- one whole set, bare array.

    Two ways this branch differs from the default one, both deliberate here so
    the page is exercised against the shape it will actually meet:

      * it answers with a bare list, not the ``{entries, total, ...}`` envelope;
      * it answers 404 for a set with no rows, which is both "this show logged
        nothing" and "you have paged past the oldest show".

    Sets beyond ``MOCK_SET_COUNT`` return the 404 so the empty-set path can be
    walked without editing anything, and set 3 is deliberately empty so the
    mid-archive case -- an empty show that is *not* the end -- is reachable too.
    """
    if page > MOCK_SET_COUNT or page == 3:
        return None

    show_id = 1950477 - page
    dj = MOCK_SET_DJS[page % len(MOCK_SET_DJS)]
    # Sets are staggered by roughly three hours so consecutive ones do not all
    # land on the same clock time, and so stepping back a few crosses midnight.
    signed_on = datetime.now(timezone.utc) - timedelta(hours=3 * (page + 1))
    length = 9 + (page % 5)

    entries = [
        {
            "id": show_id * 100,
            "show_id": show_id,
            "play_order": 0,
            "add_time": _iso(signed_on),
            "entry_type": "show_start",
            "dj_name": dj,
        }
    ]
    for i in range(length):
        aired_at = signed_on + timedelta(minutes=6 * (i + 1))
        entries.append(track_entry(i, show_id, i + 1, aired_at))
    entries.append(
        {
            "id": show_id * 100 + length + 1,
            "show_id": show_id,
            "play_order": length + 1,
            "add_time": _iso(signed_on + timedelta(minutes=6 * (length + 1))),
            "entry_type": "show_end",
            "dj_name": dj,
        }
    )
    # The endpoint hands these back newest-first.
    entries.reverse()
    return entries


# Field prefixes the real backend's parser recognises. Anything else before a
# colon is a literal character, not syntax -- same rule as FIELD_PREFIXES in
# lib/flowsheetSearch.js.
SEARCH_FIELDS = {
    "artist": "artist_name",
    "song": "track_title",
    "album": "album_title",
    "label": "record_label",
    "dj": "dj_name",
}


def _matches(row, query):
    """Whether one row satisfies `q`.

    A deliberately shallow stand-in for the real parser: it understands a bare
    substring, the `field:value` prefixes, and splitting on AND. It does NOT
    understand OR, NOT, quoting or precedence -- so a query that exercises
    those will behave differently here than in production, and that difference
    is the mock's, not the page's. It exists so the search box can be *seen*
    to filter while previewing, which matters because the page's empty,
    no-results and pagination states are unreachable when every query returns
    everything.
    """
    query = (query or "").strip()
    if not query:
        return True

    for clause in (c.strip() for c in query.split(" AND ")):
        if not clause:
            continue
        field, _, value = clause.partition(":")
        value = value.strip().strip('"')
        if _ and field.strip().lower() in SEARCH_FIELDS:
            # A prefix with nothing after it is silently dropped by the real
            # backend rather than rejected -- mirrored here so the page's
            # "one of your field filters has no value" notice can be seen.
            if not value:
                continue
            haystack = str(row.get(SEARCH_FIELDS[field.strip().lower()], ""))
        else:
            haystack = " ".join(
                str(row.get(k, ""))
                for k in ("artist_name", "track_title", "album_title", "record_label")
            )
            value = clause
        if value.lower() not in haystack.lower():
            return False
    return True


def search_results(query, page, limit):
    """GET /flowsheet/search -- one page of matches, capped total."""
    now = datetime.now(timezone.utc)

    # Build a deep pool first, then filter, so paging and the empty state are
    # both reachable. An unfiltered query keeps the capped-sentinel total the
    # real endpoint returns for its most-recent-tracks default.
    pool = []
    for i in range(len(ARTISTS) * 40):
        artist, title, album, label = ARTISTS[i % len(ARTISTS)]
        played_at = now - timedelta(hours=3 * i)
        pool.append(
            {
                "id": 5292849 + i,
                "play_date": played_at.strftime("%Y-%m-%d %H:%M:%S.%f+00")[:-3],
                "artist_name": artist,
                "track_title": title,
                "album_title": album,
                "record_label": label,
                "show_id": 1950477 - (i % 60),
                "dj_name": DJS[i % len(DJS)],
            }
        )

    matched = [row for row in pool if _matches(row, query)]
    start = page * limit
    results = matched[start : start + limit]

    total = SEARCH_COUNT_SENTINEL if not (query or "").strip() else len(matched)
    total_pages = 401 if total == SEARCH_COUNT_SENTINEL else -(-total // limit)

    return {
        "results": results,
        "total": total,
        "page": page,
        "totalPages": total_pages,
    }


def week_range(start_ms):
    """GET /flowsheet/range -- a week of shows, three a day, with entries."""
    start = datetime.fromtimestamp(start_ms / 1000, timezone.utc)
    # Seeded so reloading the same week is stable rather than reshuffling.
    rng = random.Random(start_ms)
    shows, entries = [], []
    for day in range(7):
        for slot in range(3):
            show_id = 1000 + day * 10 + slot
            begins = start + timedelta(days=day, hours=10 + slot * 3)
            shows.append(
                {
                    "id": show_id,
                    "dj_name": DJS[(day + slot) % len(DJS)],
                    "show_name": "Inside Track" if slot == 1 else None,
                    "specialty_id": 3 if slot == 1 else None,
                    "start_time": _iso(begins),
                    "end_time": _iso(begins + timedelta(hours=3)),
                }
            )
            entries.append(
                {
                    "id": show_id * 100,
                    "show_id": show_id,
                    "play_order": 0,
                    "add_time": _iso(begins),
                    "entry_type": "show_start",
                }
            )
            for n in range(rng.randint(14, 22)):
                entries.append(
                    track_entry(
                        day * 7 + slot + n,
                        show_id,
                        n + 1,
                        begins + timedelta(minutes=5 * n),
                    )
                )
    return {"shows": shows, "entries": entries}


class MockBackendHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        """Attach CORS to *every* response, errors included.

        This has to hook `end_headers` rather than be written into each sender,
        because `BaseHTTPRequestHandler.send_error` composes its own response
        and never consults ours. Without it, a 404 goes out bare -- the browser
        then refuses to hand the response to `fetch` at all and rejects with a
        network-level `TypeError`, so a page that carefully distinguishes "this
        set has no rows" from "the request failed" sees only the latter.

        That is not a hypothetical: it made `/playlist?set=3` render "Could not
        load that set." instead of "Nothing was logged for this set.", which
        looks exactly like a bug in the page's 404 handling and is not one. The
        real Backend-Service puts CORS on error responses too (Express applies
        the middleware to everything), so a mock that doesn't is lying about
        the contract in the one direction that costs debugging time.

        Deliberately wide open: this only ever listens on 127.0.0.1, and the
        dev server's port moves around.
        """
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def _send_json(self, payload):
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status, message):
        """A JSON error body, the shape Backend-Service actually returns.

        `send_error` would emit an HTML page; the real endpoint answers
        `404 {"message": "No Tracks found"}`, and a client that reads the body
        should meet the same thing here.
        """
        body = json.dumps({"message": message}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        query = parse_qs(url.query)

        def number(name, fallback):
            try:
                return int(query.get(name, [str(fallback)])[0])
            except (TypeError, ValueError):
                return fallback

        try:
            if url.path == "/flowsheet":
                if "shows_limit" in query:
                    entries = one_set(number("page", 0))
                    if entries is None:
                        self._send_error_json(404, "No Tracks found")
                    else:
                        self._send_json(entries)
                else:
                    self._send_json(recent_flowsheet(number("limit", 50)))
            elif url.path == "/flowsheet/search":
                self._send_json(
                    search_results(
                        query.get("q", [""])[0],
                        number("page", 0),
                        number("limit", 25),
                    )
                )
            elif url.path == "/flowsheet/range":
                self._send_json(week_range(number("start", 0)))
            else:
                self.send_error(404, "No mock for this path")
        except Exception:
            LOG.exception("failed to serve %s", self.path)
            self.send_error(500, "Mock handler raised")

    def log_message(self, fmt, *args):
        LOG.info("%s %s", self.address_string(), fmt % args)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=8899)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )

    try:
        server = HTTPServer((args.host, args.port), MockBackendHandler)
    except OSError as error:
        LOG.error(
            "could not bind %s:%s (%s) -- is another copy already running?",
            args.host,
            args.port,
            error,
        )
        return 1

    LOG.info("mock Backend-Service on http://%s:%s", args.host, args.port)
    LOG.info(
        "point the dev server at it: NEXT_PUBLIC_WXYC_API_URL=http://%s:%s npm run dev",
        args.host,
        args.port,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOG.info("shutting down")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
