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
 * Two things are policed here, and only one of them is WCAG's. Every
 * `text-white/NN` tint must clear AA against every backdrop its page paints —
 * that is 1.4.3. And every `bg-white/NN` fill must be light enough to read as
 * a band at all, which 1.4.3 has nothing to say about: a separator row that
 * fails to separate passes every contrast rule in the spec, which is exactly
 * how #243 shipped. Borders are still exempt, and the surface itself is
 * asserted opaque in `readableSurface.test.jsx`.
 *
 * What this file cannot see is whether a given fill is still attached to the
 * row that needs it — it reads class names out of the file, not the DOM. The
 * separator rows themselves are asserted in `playlist.test.jsx` and
 * `archivePlaylists.test.jsx`, which render them.
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

/**
 * The subset that renders a flowsheet list, and so paints a fill at all.
 * Airplay search returns tracks only — it has no breakpoints, talksets or
 * sign-ons, and paints nothing over the panel.
 */
const LIST_PAGES = ['pages/playlist.jsx', 'pages/playlists/archive.jsx']

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
 * How light a fill has to be before it reads as a band of its own rather than
 * as the panel it sits on.
 *
 * The separator rows — breakpoints, talksets, sign-ons — are the page's only
 * structure once the list is long, and at `bg-white/5` over an opaque black
 * panel they were a 13/255 grey: present in the DOM, absent to the eye. This
 * is a legibility floor, not a WCAG one; 1.4.3 says nothing about a fill that
 * carries text of its own, which is exactly why it needs stating separately.
 *
 * Applied to every fill on these pages, not only the separator's. That is
 * deliberately broader than the rule's origin: a regex over source cannot tell
 * which `bg-white/NN` belongs to which element, so the choice is between
 * policing all of them and policing none. A future decorative fill below this
 * floor will fail here and should be given its own exemption knowingly, rather
 * than have this check narrowed to keep it quiet.
 */
const MIN_FILL_ALPHA = 0.1

function source(file) {
	return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

/**
 * Every `bg-white/NN` fill a page paints over the surface, as alpha values.
 *
 * Read from the source rather than listed here, so a page that introduces a
 * new fill is measured against it instead of being silently checked against a
 * backdrop it no longer uses. Getting this wrong is invisible: a stale
 * hard-coded backdrop still produces a plausible number for every tint.
 */
function fillsIn(file) {
	return [...source(file).matchAll(/bg-white\/(\d+)/g)].map(
		(match) => Number(match[1]) / 100
	)
}

/**
 * The backdrops a tint on this page can land on: the opaque black panel, and
 * each fill the page paints over it.
 */
function backdropsIn(file) {
	return [0, ...fillsIn(file).map((alpha) => compositeWhite(alpha, 0))]
}

function worstContrastForTint(alpha, backdrops) {
	return Math.min(
		...backdrops.map((backdrop) =>
			contrastRatio(compositeWhite(alpha, backdrop), backdrop)
		)
	)
}

function tintsIn(file) {
	return [...source(file).matchAll(/text-white\/(\d+)/g)].map((match) => ({
		className: match[0],
		alpha: Number(match[1]) / 100,
	}))
}

describe('playlist surface contrast', () => {
	it.each(PAGES)('%s keeps every text tint at AA on the surface', (file) => {
		const backdrops = backdropsIn(file)
		const failing = tintsIn(file)
			.filter(
				(tint) => worstContrastForTint(tint.alpha, backdrops) < AA_BODY_TEXT
			)
			.map(
				(tint) =>
					`${tint.className} (${worstContrastForTint(
						tint.alpha,
						backdrops
					).toFixed(2)}:1)`
			)

		expect([...new Set(failing)]).toEqual([])
	})

	it.each(LIST_PAGES)(
		'%s keeps every fill above the legibility floor',
		(file) => {
			const fills = fillsIn(file)

			// Asserted non-empty first, or the check passes vacuously in the one
			// case it most needs to catch: delete the separator's fill outright,
			// rather than lowering it, and `fillsIn` returns nothing at all —
			// `expect([]).toEqual([])` is green while the row is invisible again.
			// This does not prove the fill is still on the separator row; only
			// that the page still paints one. The row itself is asserted where it
			// is rendered.
			expect(fills.length).toBeGreaterThan(0)
			expect(fills.filter((alpha) => alpha < MIN_FILL_ALPHA)).toEqual([])
		}
	)

	it('agrees with the published ratios for the tints in use', () => {
		// Sanity-check the maths itself, so a bug in the helpers above cannot
		// quietly turn the guard into a no-op. White on black is the textbook
		// 21:1; the two tints either side of the floor are the ones that
		// decide whether this suite has any teeth.
		expect(contrastRatio(255, 0)).toBeCloseTo(21, 1)
		expect(contrastRatio(compositeWhite(0.5, 0), 0)).toBeCloseTo(5.28, 1)
		expect(contrastRatio(compositeWhite(0.4, 0), 0)).toBeCloseTo(3.66, 1)

		// A filled row lightens text and backdrop together, so it is never the
		// worse case by much — but it is the worse case.
		expect(worstContrastForTint(1, [0, compositeWhite(0.1, 0)])).toBeLessThan(
			contrastRatio(255, 0)
		)

		// Still the maths, not the pages: these two literals are not read from
		// any source file, so changing a page's classes will not move them.
		// They are here so a bug in `compositeWhite` or `contrastRatio` fails
		// loudly against a hand-checked number, which is what would otherwise
		// turn every derived assertion above into a confident no-op.
		expect(
			contrastRatio(
				compositeWhite(0.7, compositeWhite(0.1, 0)),
				compositeWhite(0.1, 0)
			)
		).toBeCloseTo(9.03, 1)
	})
})
