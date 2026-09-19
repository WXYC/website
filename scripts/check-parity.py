#!/usr/bin/env python3
"""Compare how two origins serve this site's static export (WXYC/website#262).

Built for the GitHub Pages -> Cloudflare Workers migration: origin A is the
reference (production), origin B is the candidate (the workers.dev preview,
later the live apex). The route list is derived from a local build -- every
file under out/ -- so nothing is spot-checked by hand: 174 of the upload
filenames contain spaces, dozens more contain ():]+&, and at least one is
non-ASCII, which is exactly where two static hosts diverge on
percent-encoding and Unicode normalization.

Usage:

    npm run build   # or the tinacms-dev + next-build recipe in pr-open.yml
    python3 scripts/check-parity.py https://wxyc.org https://<preview>.workers.dev

What it asserts, per file:

  * Same status on both origins (redirects must also agree on their target).
  * Same Content-Length when both answer 200 and expose it.
  * On origin B only: Cache-Control matches the public/_headers rules for
    /_next/static/* and /uploads/*; other paths are report-only.
  * Exactly the EXPECTED_MISSING set 404s on B (files .assetsignore excludes
    plus the control files Workers assets never serves). A 404 on B outside
    that set fails the run; so does a sixth entry appearing in the set.

Two known, accepted deltas are reported but never fail the run: bare
directory paths redirect with a different status code (301 on Pages, 307/308
on Workers) as long as the target agrees, and trailing-slash variants of
file-shaped pages (404 on Pages, redirect on Workers). Standard library only,
read-only, ~16 concurrent HEAD requests.
"""

import argparse
import concurrent.futures
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

EXPECTED_MISSING = {
	"uploads/iPhone_App_Screen_Recording.mov",  # over the 25MiB Workers cap
	".gitignore",
	"admin/.gitignore",
	"_headers",
	".assetsignore",
}

CACHE_RULES = (  # mirror public/_headers; asserted on origin B only
	("_next/static/", "public, max-age=31536000, immutable"),
	("uploads/", "public, max-age=600"),
)

class NoRedirect(urllib.request.HTTPRedirectHandler):
	def redirect_request(self, *args, **kwargs):
		return None

OPENER = urllib.request.build_opener(NoRedirect)

def fetch(base, path):
	"""HEAD base/path without following redirects.

	Returns (status, headers). Encodes each path segment separately so
	spaces and punctuation in upload filenames survive verbatim.
	"""
	encoded = "/".join(urllib.parse.quote(seg) for seg in path.split("/"))
	# Cloudflare's bot rules 403 the default Python-urllib agent; identify
	# honestly instead.
	req = urllib.request.Request(
		f"{base}/{encoded}",
		method="HEAD",
		headers={"User-Agent": "wxyc-check-parity (WXYC/website scripts/check-parity.py)"},
	)
	try:
		with OPENER.open(req, timeout=30) as resp:
			return resp.status, dict(resp.headers)
	except urllib.error.HTTPError as err:
		return err.code, dict(err.headers)

def routes_for(rel):
	"""Map an out/ file to the URL paths worth probing.

	Returns (canonical, delta_probe): the canonical path must behave
	identically on both origins; the probe is only reported (trailing-slash
	and bare-directory behavior differs by design between the two hosts).
	"""
	if not rel.endswith(".html"):
		return rel, None
	if rel == "index.html":
		return "", None
	if rel.endswith("/index.html"):
		directory = rel[: -len("index.html")]
		return directory, directory.rstrip("/")  # /dir/ canonical, /dir probed
	page = rel[: -len(".html")]
	return page, page + "/"  # /page canonical, /page/ probed

def redirect_target(base, headers):
	location = headers.get("Location") or headers.get("location") or ""
	return urllib.parse.urljoin(base + "/", location).replace(base, "", 1)

def check(rel, base_a, base_b):
	failures, deltas = [], []
	canonical, probe = routes_for(rel)

	if rel in EXPECTED_MISSING:
		status_b, _ = fetch(base_b, canonical)
		if status_b != 404:
			failures.append(f"{rel}: expected 404 on B (excluded asset), got {status_b}")
		return failures, deltas

	status_a, headers_a = fetch(base_a, canonical)
	status_b, headers_b = fetch(base_b, canonical)

	if status_b == 404 and status_a != 404 and any(ord(c) > 127 for c in rel):
		# Distinguish "missing" from "stored under the other normalization".
		for form in ("NFC", "NFD"):
			variant = unicodedata.normalize(form, canonical)
			if variant != canonical and fetch(base_b, variant)[0] != 404:
				failures.append(f"{rel}: B serves it only {form}-normalized -- normalization divergence")
				return failures, deltas

	if status_a != status_b:
		both_redirects = status_a in (301, 302, 307, 308) and status_b in (301, 302, 307, 308)
		if both_redirects and redirect_target(base_a, headers_a) == redirect_target(base_b, headers_b):
			deltas.append(f"/{canonical}: redirect status {status_a} vs {status_b}, same target")
		else:
			failures.append(f"/{canonical}: status {status_a} on A vs {status_b} on B")
			return failures, deltas

	if status_a == 200 and status_b == 200:
		length_a, length_b = headers_a.get("Content-Length"), headers_b.get("Content-Length")
		if length_a and length_b and length_a != length_b:
			failures.append(f"/{canonical}: Content-Length {length_a} vs {length_b}")

	for prefix, expected in CACHE_RULES:
		if rel.startswith(prefix):
			got = headers_b.get("Cache-Control", "<none>")
			if got != expected:
				failures.append(f"/{canonical}: Cache-Control on B is {got!r}, _headers says {expected!r}")

	if probe is not None:
		probe_a, headers_pa = fetch(base_a, probe)
		probe_b, headers_pb = fetch(base_b, probe)
		if (probe_a, probe_b) not in ((200, 200),):
			deltas.append(f"/{probe}: {probe_a} on A vs {probe_b} on B (directory/trailing-slash probe)")

	return failures, deltas

def main():
	parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
	parser.add_argument("base_a", help="reference origin, e.g. https://wxyc.org")
	parser.add_argument("base_b", help="candidate origin, e.g. the workers.dev preview")
	parser.add_argument("--out", default="out", help="local build to enumerate (default: out)")
	args = parser.parse_args()

	root = Path(args.out)
	if not root.is_dir():
		sys.exit(f"{root}/ not found -- build the site first (see pr-open.yml for the local recipe)")
	base_a, base_b = args.base_a.rstrip("/"), args.base_b.rstrip("/")

	files = sorted(
		str(p.relative_to(root)) for p in root.rglob("*")
		if p.is_file() and str(p.relative_to(root)) != "404.html"
	)
	missing_paths = "does-not-exist-" + files[0].split("/")[0]
	all_failures, all_deltas = [], []

	with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
		results = pool.map(lambda rel: check(rel, base_a, base_b), files)
		for failures, deltas in results:
			all_failures.extend(failures)
			all_deltas.extend(deltas)

	status_a, _ = fetch(base_a, missing_paths)
	status_b, _ = fetch(base_b, missing_paths)
	if (status_a, status_b) != (404, 404):
		all_failures.append(f"unknown path: {status_a} on A vs {status_b} on B, expected 404/404")

	print(f"checked {len(files)} files against {base_a} and {base_b}")
	for line in all_deltas:
		print(f"  delta    {line}")
	for line in all_failures:
		print(f"  FAILURE  {line}")
	print(f"{len(all_failures)} failures, {len(all_deltas)} accepted deltas")
	sys.exit(1 if all_failures else 0)

if __name__ == "__main__":
	main()
