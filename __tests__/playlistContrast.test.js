/**
 * Contrast floor for the public playlist surfaces (WXYC/website#234).
 *
 * These three pages sit on an opaque `ReadableSurface`, which is what makes a
 * contrast ratio calculable at all — over the animated background it is a
 * different number every frame. With the surface in place the ratio is fixed
 * by the text tint alone, so it can be checked without a browser.
 *
 * Deliberately a source-level check rather than a render test, matching
 * `wxycInfoLinks.test.js`: jsdom computes no colours, so a rendered assertion
 * could only re-state the class name it was given.
 *
 * Only `text-white/NN` tints are policed. Borders and decorative fills carry
 * no text and are exempt from 1.4.3; the surface itself is asserted opaque in
 * `readableSurface.test.jsx`.
 */
import {describe, it, expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const PAGES = [
	'pages/playlist.jsx',
	'pages/airplay-search.jsx',
	'pages/playlists/archive.jsx',
]

/** WCAG AA for body copy. Large text may go to 3:1; none of these rely on it. */
const AA_BODY_TEXT = 4.5

/** sRGB 0-255 channel to linear light. */
function toLinear(channel) {
	const c = channel / 255
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance of an opaque grey. */
function luminance(grey) {
	return toLinear(grey)
}

/** `alpha` white over `backdrop`, as a grey channel value. */
function compositeWhite(alpha, backdrop) {
	return alpha * 255 + (1 - alpha) * backdrop
}

function contrastRatio(foreground, background) {
	const [brighter, darker] = [
		luminance(foreground),
		luminance(background),
	].sort((a, b) => b - a)
	return (brighter + 0.05) / (darker + 0.05)
}

/**
 * The two backdrops a tint can land on inside the surface: the opaque black
 * panel, and the `bg-white/5` fill the non-track rows use over it.
 */
const BACKDROPS = [0, compositeWhite(0.05, 0)]

function worstContrastForTint(alpha) {
	return Math.min(
		...BACKDROPS.map((backdrop) =>
			contrastRatio(compositeWhite(alpha, backdrop), backdrop)
		)
	)
}

function tintsIn(file) {
	const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
	return [...source.matchAll(/text-white\/(\d+)/g)].map((match) => ({
		className: match[0],
		alpha: Number(match[1]) / 100,
	}))
}

describe('playlist surface contrast', () => {
	it.each(PAGES)('%s keeps every text tint at AA on the surface', (file) => {
		const failing = tintsIn(file)
			.filter((tint) => worstContrastForTint(tint.alpha) < AA_BODY_TEXT)
			.map(
				(tint) =>
					`${tint.className} (${worstContrastForTint(tint.alpha).toFixed(2)}:1)`
			)

		expect([...new Set(failing)]).toEqual([])
	})

	it('agrees with the published ratios for the tints in use', () => {
		// Sanity-check the maths itself, so a bug in the helpers above cannot
		// quietly turn the guard into a no-op. White on black is the textbook
		// 21:1; the two tints either side of the floor are the ones that
		// decide whether this suite has any teeth.
		expect(contrastRatio(255, 0)).toBeCloseTo(21, 1)
		expect(contrastRatio(compositeWhite(0.5, 0), 0)).toBeCloseTo(5.28, 1)
		expect(contrastRatio(compositeWhite(0.4, 0), 0)).toBeCloseTo(3.66, 1)

		// The `bg-white/5` rows lighten text and backdrop together, so they
		// are never the worse case by much — but they are the worse case.
		expect(worstContrastForTint(1)).toBeLessThan(contrastRatio(255, 0))
	})
})
