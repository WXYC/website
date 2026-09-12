/**
 * An opaque panel for a page of dense body copy.
 *
 * The site paints an animated WebGL background behind every page
 * (`components/LavaLiteBackground.jsx`). Behind a headline that reads fine;
 * behind a playlist — hundreds of rows of small type — it does not. Text over
 * a moving gradient has no fixed contrast ratio, so legibility becomes a
 * property of whichever frame you happened to look at, and several frames fall
 * below WCAG AA. Listeners reported it as "nearly impossible to read"
 * (WXYC/website#234).
 *
 * The fix is to stop the two from overlapping rather than to remove either:
 * the background still surrounds the page — gutters, header, footer — and the
 * type sits on a constant black field.
 *
 * The background is deliberately fully opaque rather than a near-opaque
 * `bg-black/95`. Any alpha leaves contrast a function of the frame
 * underneath, which is the dependency this component exists to remove; a 5%
 * bleed-through of the shader's brightest output is enough to pull the
 * dimmest supported text tint (`text-white/50`) to roughly 5:1, close enough
 * to the 4.5:1 floor that a later brightness tweak could quietly cross it.
 *
 * `data-readable-surface` is the marker tests assert against, so a page can
 * pin "this list is on the surface" without pinning the exact Tailwind
 * classes that put it there.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children Page content to sit on the surface.
 * @param {string} [props.className] Extra classes, appended to the defaults.
 */
export default function ReadableSurface({children, className = ''}) {
	const classes = [
		'rounded-lg border border-white/15 bg-black px-4 py-6 sm:px-8 sm:py-8',
		className,
	]
		.filter(Boolean)
		.join(' ')

	return (
		<div data-readable-surface="" className={classes}>
			{children}
		</div>
	)
}
