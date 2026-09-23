#!/usr/bin/env python3
"""Regenerate the browser and iOS icons in public/ from the master artwork.

The station's app icon lives at images/app-icon.png (1024x1024). Everything
public/ serves as an icon is derived from it by this script, so the two never
drift apart and neither is hand-edited:

    public/apple-touch-icon.png   180x180, what iOS asks for
    public/favicon.ico            16 + 32 + 48, what browsers ask for

Run it after replacing the master, then commit the results:

    python3 scripts/generate-icons.py

macOS only: resizing uses `sips`, which ships with the OS. There is no
ImageMagick or Pillow in this project's toolchain and neither is worth adding
for a task that runs when the station rebrands.

The .ico container is assembled here rather than by a tool because nothing
available can write one. The format is small and well specified: a 6-byte
ICONDIR, one 16-byte ICONDIRENTRY per size, then the image payloads. Each
payload is a PNG rather than a BMP -- every browser has read PNG-in-ICO since
Windows Vista, and it avoids hand-rolling BMP with its bottom-up rows and
doubled height field.
"""

import os
import struct
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER = os.path.join(ROOT, "images", "app-icon.png")
TOUCH_ICON = os.path.join(ROOT, "public", "apple-touch-icon.png")
FAVICON = os.path.join(ROOT, "public", "favicon.ico")

TOUCH_ICON_SIZE = 180
FAVICON_SIZES = (16, 32, 48)


def resize(source, size, destination):
	"""Square-resize with sips. Exits nonzero if sips does."""
	subprocess.run(
		["sips", "-z", str(size), str(size), source, "--out", destination],
		check=True,
		stdout=subprocess.DEVNULL,
		stderr=subprocess.PIPE,
	)
	return destination


def build_ico(png_paths):
	"""Assemble a multi-size .ico whose entries are PNG payloads."""
	payloads = []
	for path in png_paths:
		with open(path, "rb") as handle:
			payloads.append(handle.read())

	# ICONDIR: reserved, type 1 (icon), image count.
	header = struct.pack("<HHH", 0, 1, len(payloads))
	offset = len(header) + 16 * len(payloads)

	directory = b""
	for size, payload in zip(FAVICON_SIZES, payloads):
		# A 0 in the width/height byte means 256; our sizes are all smaller.
		directory += struct.pack(
			"<BBBBHHII",
			size if size < 256 else 0,
			size if size < 256 else 0,
			0,  # palette size, 0 for non-palettised
			0,  # reserved
			1,  # colour planes
			32,  # bits per pixel
			len(payload),
			offset,
		)
		offset += len(payload)

	return header + directory + b"".join(payloads)


def main():
	if not os.path.isfile(MASTER):
		sys.exit(f"master artwork not found at {MASTER}")

	resize(MASTER, TOUCH_ICON_SIZE, TOUCH_ICON)
	print(f"wrote {os.path.relpath(TOUCH_ICON, ROOT)} ({TOUCH_ICON_SIZE}x{TOUCH_ICON_SIZE})")

	with tempfile.TemporaryDirectory() as workdir:
		pngs = [
			resize(MASTER, size, os.path.join(workdir, f"favicon-{size}.png"))
			for size in FAVICON_SIZES
		]
		with open(FAVICON, "wb") as handle:
			handle.write(build_ico(pngs))
	print(
		f"wrote {os.path.relpath(FAVICON, ROOT)} "
		f"({' + '.join(str(s) for s in FAVICON_SIZES)})"
	)
	return 0


if __name__ == "__main__":
	sys.exit(main())
