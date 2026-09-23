#!/usr/bin/env python3
"""Write sitemap.xml for this site's static export.

Enumerates the pages the build actually produced -- every .html file under
out/ -- rather than a hand-maintained list, so a new page or blog post is in
the sitemap the moment it builds. /sitemap.xml was 404ing for ~94 requests a
week before this existed.

Run it AFTER `next build`, against the finished export:

    npx next build
    python3 scripts/generate-sitemap.py

It writes <build-dir>/sitemap.xml, so it must run before the Cloudflare
assets tar is packed. Both workflows do that; see .github/workflows/.

Deliberate exclusions, each for its own reason:

  * 404.html -- an error page, not a destination.
  * admin/** -- the TinaCMS editor SPA. Nothing there is public content.
  * _next/** -- build artifacts, not pages.
  * open-engineering-work, for-credit -- the two standalone documents in
    public/ are DELIBERATELY UNLINKED (see README): each exists to be handed
    to someone directly. Listing them in a sitemap would advertise to every
    crawler exactly what the pages were designed not to be.
  * fiftieth -- a 301 alias for /50th (public/_redirects). Listing both
    would be duplicate content pointing at one page.
  * listen/ -- public/listen/index.html is a meta-refresh shim whose own
    rel=canonical points at the site root. Same duplicate-content case as
    /fiftieth; it just redirects by markup instead of by a _redirects rule,
    which is why it is easy to miss.

No <lastmod>. A CI checkout stamps every file with the checkout time, so a
mtime-derived lastmod would claim the whole site changed on every deploy --
worse than omitting an optional element. Standard library only.
"""

import argparse
import os
import sys
from urllib.parse import quote
from xml.sax.saxutils import escape

DEFAULT_BASE_URL = "https://wxyc.org"
DEFAULT_ROOT = "out"

# Path prefixes (relative to the build root) that never belong in a sitemap.
EXCLUDED_PREFIXES = ("admin/", "_next/")

# Exact routes excluded; see the module docstring for why each one.
EXCLUDED_ROUTES = frozenset(
	{
		"/404",
		"/open-engineering-work",
		"/for-credit",
		"/fiftieth",
		"/listen/",
	}
)


def html_files(root):
	"""Yield every .html file under root, as paths relative to root."""
	for dirpath, _dirnames, filenames in os.walk(root):
		for name in filenames:
			if not name.endswith(".html"):
				continue
			full = os.path.join(dirpath, name)
			yield os.path.relpath(full, root)


def route_for(relpath):
	"""Map a built file to the URL path the Worker serves it at.

	index.html -> /, privacy.html -> /privacy, listen/index.html -> /listen/.

	The trailing slash on a directory index is not cosmetic. Under the
	Worker's html_handling: "auto-trailing-slash" the slashed form is
	canonical and the bare path redirects to it -- https://wxyc.org/listen
	answers 307 to /listen/. Emitting the bare path would fill the sitemap
	with URLs Search Console files under "Page with redirect" and drops.
	"""
	parts = relpath.split(os.sep)
	if parts[-1] == "index.html":
		return "/" + "".join(part + "/" for part in parts[:-1])
	parts[-1] = parts[-1][: -len(".html")]
	return "/" + "/".join(parts)


def routes(root):
	"""Every indexable route in the build, sorted, deduplicated."""
	found = set()
	for relpath in html_files(root):
		normalized = relpath.replace(os.sep, "/")
		if normalized.startswith(EXCLUDED_PREFIXES):
			continue
		route = route_for(relpath)
		if route in EXCLUDED_ROUTES:
			continue
		found.add(route)
	return sorted(found)


def sitemap_xml(base_url, route_list):
	"""Render a urlset. Paths are percent-encoded, then XML-escaped."""
	base = base_url.rstrip("/")
	lines = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
	]
	for route in route_list:
		loc = base + quote(route)
		lines.append("\t<url>")
		lines.append("\t\t<loc>" + escape(loc) + "</loc>")
		lines.append("\t</url>")
	lines.append("</urlset>")
	return "\n".join(lines) + "\n"


def main():
	parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
	parser.add_argument(
		"--root",
		default=DEFAULT_ROOT,
		help=f"build output directory (default: {DEFAULT_ROOT})",
	)
	parser.add_argument(
		"--base-url",
		default=DEFAULT_BASE_URL,
		help=f"origin to prefix each path with (default: {DEFAULT_BASE_URL})",
	)
	args = parser.parse_args()

	if not os.path.isdir(args.root):
		sys.exit(
			f"{args.root}/ not found -- build the site first "
			"(see pr-open.yml for the local recipe)"
		)

	route_list = routes(args.root)
	if not route_list:
		sys.exit(f"no indexable pages found under {args.root}/ -- refusing to write an empty sitemap")

	destination = os.path.join(args.root, "sitemap.xml")
	with open(destination, "w", encoding="utf-8") as handle:
		handle.write(sitemap_xml(args.base_url, route_list))

	print(f"wrote {destination}: {len(route_list)} urls, base {args.base_url}")
	return 0


if __name__ == "__main__":
	sys.exit(main())
