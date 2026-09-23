import {describe, it, expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const ICON = path.join(ROOT, 'public', 'apple-touch-icon.png')

/**
 * iOS requests /apple-touch-icon.png -- and, on older devices, the
 * -precomposed variant -- from the site root whenever no <link> declares one.
 * Those two blind probes were ~244 404s a week against wxyc.org. Three things
 * have to hold together to keep them answered, and each is pinned here: the
 * file exists at the root path, the shared Head declares it so the probe stops
 * being blind, and the -precomposed path redirects to the one real icon rather
 * than duplicating the binary.
 *
 * The Head assertion reads the source rather than rendering <Layout>, which is
 * a real limitation and not a preference: Layout imports Header.js, and this
 * repo's vitest config does not set an esbuild `loader` that parses JSX inside
 * a `.js` file, so importing Layout fails to transform before any mock can
 * intervene. Teaching the config that loader (or moving those components to
 * `.jsx`, as every component a test imports today already is) would let this
 * become a render assertion.
 */
describe('apple-touch-icon', () => {
	it('ships a square 180x180 PNG at the root path iOS asks for', () => {
		expect(fs.existsSync(ICON)).toBe(true)

		const buffer = fs.readFileSync(ICON)
		// PNG signature, then IHDR carries width/height as big-endian uint32.
		expect(buffer.subarray(0, 8)).toEqual(
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
		)
		expect(buffer.toString('ascii', 12, 16)).toBe('IHDR')
		expect(buffer.readUInt32BE(16)).toBe(180)
		expect(buffer.readUInt32BE(20)).toBe(180)
	})

	it('declares the icon in the shared Head so iOS stops probing the root', () => {
		const source = fs.readFileSync(
			path.join(ROOT, 'components', 'Layout.js'),
			'utf8'
		)
		const link = source.match(/<link[^>]*rel="apple-touch-icon"[^>]*\/>/)
		expect(
			link,
			'no <link rel="apple-touch-icon"> in components/Layout.js'
		).not.toBeNull()
		expect(link[0]).toContain('href="/apple-touch-icon.png"')
	})

	it('redirects the -precomposed path to the one real icon', () => {
		// One binary, two paths. The no-splat invariant on this file is pinned
		// in fiftiethRedirect.test.jsx and covers this rule too.
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
