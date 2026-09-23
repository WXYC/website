import {describe, it, expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const MASTER = path.join(ROOT, 'images', 'app-icon.png')
const TOUCH_ICON = path.join(ROOT, 'public', 'apple-touch-icon.png')
const FAVICON = path.join(ROOT, 'public', 'favicon.ico')
const LAYOUT = path.join(ROOT, 'components', 'Layout.js')

const PNG_SIGNATURE = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

/** Width and height out of a PNG's IHDR chunk. */
function pngSize(buffer) {
	expect(buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE)
	expect(buffer.toString('ascii', 12, 16)).toBe('IHDR')
	return {width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20)}
}

/** Parse an .ico into its directory entries plus each embedded payload. */
function readIco(buffer) {
	const reserved = buffer.readUInt16LE(0)
	const type = buffer.readUInt16LE(2)
	const count = buffer.readUInt16LE(4)
	const entries = []
	for (let i = 0; i < count; i += 1) {
		const base = 6 + i * 16
		const size = buffer.readUInt32LE(base + 8)
		const offset = buffer.readUInt32LE(base + 12)
		entries.push({
			// A 0 in these bytes means 256; every size here is smaller.
			declaredWidth: buffer.readUInt8(base) || 256,
			declaredHeight: buffer.readUInt8(base + 1) || 256,
			payload: buffer.subarray(offset, offset + size),
		})
	}
	return {reserved, type, entries}
}

/**
 * Every icon public/ serves is generated from images/app-icon.png by
 * scripts/generate-icons.py. These tests pin the shape of the generated
 * artifacts and the fact that the document declares them, which is the half
 * that actually stops iOS probing the site root blindly.
 *
 * The Head assertions read Layout's source rather than rendering it, which is
 * a real limitation rather than a preference: Layout imports Header.js, and
 * this repo's vitest config sets no esbuild `loader` that parses JSX inside a
 * `.js` file, so the import fails to transform before a mock can intervene.
 * Teaching the config that loader (or moving those components to `.jsx`, as
 * every component a test imports today already is) would let these become
 * render assertions.
 */
describe('site icons', () => {
	it('keeps the master artwork the generator derives everything from', () => {
		// Without this, nobody can regenerate either icon.
		expect(fs.existsSync(MASTER)).toBe(true)
		const {width, height} = pngSize(fs.readFileSync(MASTER))
		expect(width).toBe(height)
		expect(width).toBeGreaterThanOrEqual(512)
	})

	describe('apple-touch-icon', () => {
		/**
		 * iOS requests /apple-touch-icon.png -- and, on older devices, the
		 * -precomposed variant -- from the site root whenever no <link> names
		 * an icon. Those two blind probes were ~244 404s a week.
		 */
		it('is a square 180x180 PNG at the root path iOS asks for', () => {
			expect(fs.existsSync(TOUCH_ICON)).toBe(true)
			expect(pngSize(fs.readFileSync(TOUCH_ICON))).toEqual({
				width: 180,
				height: 180,
			})
		})

		it('is declared in the shared Head, so iOS stops probing the root', () => {
			const source = fs.readFileSync(LAYOUT, 'utf8')
			const link = source.match(/<link[^>]*rel="apple-touch-icon"[^>]*\/>/)
			expect(
				link,
				'no <link rel="apple-touch-icon"> in components/Layout.js'
			).not.toBeNull()
			expect(link[0]).toContain('href="/apple-touch-icon.png"')
		})

		it('redirects the -precomposed path to the one real icon', () => {
			// One binary, two paths. The no-splat invariant on this file is
			// pinned in fiftiethRedirect.test.jsx and covers this rule too.
			const rules = fs
				.readFileSync(path.join(ROOT, 'public', '_redirects'), 'utf8')
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith('#'))
				.map((line) => line.split(/\s+/))

			expect(rules).toContainEqual([
				'/apple-touch-icon-precomposed.png',
				'/apple-touch-icon.png',
				'301',
			])
		})
	})

	describe('favicon', () => {
		it('is a multi-size .ico carrying 16, 32 and 48', () => {
			expect(fs.existsSync(FAVICON)).toBe(true)
			const {reserved, type, entries} = readIco(fs.readFileSync(FAVICON))
			expect(reserved).toBe(0)
			expect(type).toBe(1) // 1 = icon, 2 = cursor
			expect(entries.map((e) => e.declaredWidth)).toEqual([16, 32, 48])
		})

		it('declares each size honestly -- the payload really is that big', () => {
			// A directory entry claiming a size its PNG does not have is the
			// one corruption a browser resolves by silently picking nothing.
			const {entries} = readIco(fs.readFileSync(FAVICON))
			for (const entry of entries) {
				expect(pngSize(entry.payload)).toEqual({
					width: entry.declaredWidth,
					height: entry.declaredHeight,
				})
			}
		})

		it('is served from this origin, not a third-party CDN', () => {
			// It pointed at an Apple CDN thumbnail until #271: a third-party
			// dependency on every page load for a first-party asset, which
			// would have broken silently if that URL ever rotated.
			const source = fs.readFileSync(LAYOUT, 'utf8')
			const link = source.match(/<link[^>]*rel="icon"[^>]*\/>/)
			expect(
				link,
				'no <link rel="icon"> in components/Layout.js'
			).not.toBeNull()
			expect(link[0]).toContain('href="/favicon.ico"')

			// Guard against a live reference coming back, not against the
			// comment above that link explaining what it replaced -- so
			// strip JSX comments before looking.
			const code = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
			expect(code).not.toContain('mzstatic.com')
		})
	})
})
