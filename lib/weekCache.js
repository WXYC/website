/**
 * In-memory cache of already-fetched archive weeks.
 *
 * A week of flowsheet history is 458 KB gzipped and 2.07 MB of JSON in
 * production, and `GET /flowsheet/range` sends no `Cache-Control`, so the
 * browser will not reuse a response on its own. Paging back four weeks and
 * forward again therefore re-downloads and re-parses all eight — on a page
 * whose primary interaction is exactly that, and whose audience is mostly on
 * phones. Holding the parsed result makes Previous/Next and the browser's Back
 * button instant.
 *
 * Deliberately module-level rather than React state: it should survive
 * unmounting the page, which is the case (navigating away and back) where a
 * refetch is most obviously wasted.
 */

/** Weeks to keep. Eight is a couple of months of paging in either direction. */
const LIMIT = 8

const cache = new Map()

/**
 * A previously fetched week, if it is still held.
 *
 * @param {string} week Monday of the week, `YYYY-MM-DD`.
 * @returns {*} The cached value, or undefined.
 */
export function getCachedWeek(week) {
	return cache.get(week)
}

/**
 * Hold a fetched week.
 *
 * Weeks at or after `currentWeek` are not cached: the current week is still
 * being written to as shows air, and serving a stale copy from memory would
 * quietly hide anything that went out since the visitor arrived. Past weeks are
 * immutable history — barring a librarian's correction, which is rare enough
 * and undramatic enough that a reload is a fine remedy.
 *
 * @param {string} week Monday of the week, `YYYY-MM-DD`.
 * @param {*} value Value to hold.
 * @param {string} currentWeek Monday of the week in progress, `YYYY-MM-DD`.
 */
export function setCachedWeek(week, value, currentWeek) {
	if (week >= currentWeek) return
	// Re-insert so recently used weeks sort to the end of the eviction order.
	cache.delete(week)
	cache.set(week, value)
	while (cache.size > LIMIT) {
		cache.delete(cache.keys().next().value)
	}
}

/** Drop everything. Exists so tests start from a known state. */
export function clearWeekCache() {
	cache.clear()
}
