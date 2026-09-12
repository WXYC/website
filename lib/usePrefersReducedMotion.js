import {useSyncExternalStore} from 'react'

/**
 * The OS-level "reduce motion" accessibility setting, as a media query.
 *
 * Readers who set it are asking every site to stop animating — for some of
 * them continuous motion is a vestibular trigger, for others it is simply
 * fatiguing to read past. See WXYC/website#234.
 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * The `MediaQueryList` for {@link REDUCED_MOTION_QUERY}, or `null` where there
 * is no `matchMedia` to ask — during the static export's server render, and in
 * any environment that predates or stubs it out.
 */
function reducedMotionQuery() {
	if (typeof window === 'undefined') return null
	if (typeof window.matchMedia !== 'function') return null
	return window.matchMedia(REDUCED_MOTION_QUERY)
}

function subscribe(onStoreChange) {
	const query = reducedMotionQuery()
	if (!query) return () => {}

	if (typeof query.addEventListener === 'function') {
		query.addEventListener('change', onStoreChange)
		return () => query.removeEventListener('change', onStoreChange)
	}

	// Safari before 14 only has the deprecated listener pair.
	query.addListener(onStoreChange)
	return () => query.removeListener(onStoreChange)
}

function getSnapshot() {
	return reducedMotionQuery()?.matches ?? false
}

function getServerSnapshot() {
	// No preference is knowable without a browser, and animation is the
	// site's default, so the pre-hydration answer is "not reduced".
	return false
}

/**
 * Whether the reader has asked their OS to reduce motion.
 *
 * Read through `useSyncExternalStore` rather than `useState` + `useEffect` on
 * purpose: the hook has to report the right answer on the *first* render, not
 * correct itself once an effect has run. A one-render-late answer lets the
 * animation start and then stop, which is the jolt the setting exists to
 * prevent. `useSyncExternalStore` also keeps the server snapshot explicit, so
 * the static export hydrates without a mismatch.
 *
 * @returns {boolean} `true` while `(prefers-reduced-motion: reduce)` matches.
 *   Re-renders the caller when the reader changes the setting mid-session.
 */
export function usePrefersReducedMotion() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
