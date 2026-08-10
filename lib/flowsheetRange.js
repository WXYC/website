/**
 * Client for Backend-Service's public `GET /flowsheet/range`, plus the grouping
 * that turns its two flat arrays into the day → show → entries shape the
 * historical archive page renders.
 *
 * Contract: `wxyc-shared/api.yaml` `/flowsheet/range`. Successor to tubafrenzy's
 * `/playlists/radioWeek`, which dies at the 2026-08-31 cutover.
 */

import {
	addDays,
	easternDateOf,
	easternMidnightEpoch,
	formatEasternTime,
} from './easternTime'

/**
 * Backend origin. Overridable at build time for staging; static export bakes
 * `NEXT_PUBLIC_*` in, so this is a build-time choice, not a runtime one.
 */
export const API_BASE =
	process.env.NEXT_PUBLIC_WXYC_API_URL || 'https://api.wxyc.org'

/**
 * Widest window the endpoint will serve, in milliseconds.
 *
 * Backend rejects anything longer with a `400`. It is 8 days rather than 7
 * precisely so a calendar week spanning the autumn DST transition — which is
 * 7 days and 1 hour — still fits. Mirrored here so the page can refuse to build
 * an over-long request rather than discovering the ceiling from a 400.
 */
export const MAX_RANGE_MS = 8 * 24 * 60 * 60 * 1000

/** Label for entries with no usable show. */
export const UNATTRIBUTED_DJ_LABEL = 'Unattributed'

/** Backend entry types that carry a played track. */
const TRACK = 'track'

/**
 * Entry types that are worth a row.
 *
 * `show_start` / `show_end` are deliberately absent. They are delimiter rows
 * that restate what the show header already says — who signed on, and when — so
 * rendering them inside the show they delimit is pure duplication. Excluding
 * them here rather than at render time also makes "does this show have anything
 * to display" a simple emptiness check: a show whose only rows are its own two
 * delimiters is a sign-on/sign-off shell with no air content, and drops out.
 * Production runs one to three of those a week out of roughly sixty shows.
 */
const DISPLAYABLE_TYPES = new Set(['track', 'talkset', 'breakpoint'])

/**
 * Fetch one window of flowsheet history.
 *
 * @param {string} startDate Inclusive first day, `YYYY-MM-DD` (Eastern).
 * @param {number} days Window length in calendar days.
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] Abort signal for the request.
 * @param {typeof fetch} [options.fetchImpl] Injectable fetch, for tests.
 * @returns {Promise<{shows: Array, entries: Array}>}
 * @throws {Error} On a non-OK response or a window over the ceiling.
 */
export async function fetchFlowsheetRange(startDate, days, options = {}) {
	const {signal, fetchImpl = fetch} = options

	const start = easternMidnightEpoch(startDate)
	const end = easternMidnightEpoch(addDays(startDate, days))

	if (end - start > MAX_RANGE_MS) {
		throw new Error(
			`Window of ${days} days exceeds the ${
				MAX_RANGE_MS / 86400000
			}-day maximum`
		)
	}

	const response = await fetchImpl(
		`${API_BASE}/flowsheet/range?start=${start}&end=${end}`,
		{
			// This is a public read on a public site. Sending cookies would both
			// be pointless and defeat the wildcard-free CORS allowlist.
			credentials: 'omit',
			signal,
		}
	)

	if (!response.ok) {
		throw new Error(
			response.status === 400
				? 'That date range could not be loaded. Try a different week.'
				: `Could not load playlists (${response.status}).`
		)
	}

	return response.json()
}

/**
 * Group a range response into days, each holding its shows in air order.
 *
 * Grouping is on `show_id`, not on the inline `show_start` / `show_end` marker
 * rows. The markers are a convenience, not a guarantee: a show whose `show_end`
 * delivery was dropped has no closing marker, so segmenting on markers alone
 * runs one show's entries into the next. The markers themselves are dropped —
 * see {@link DISPLAYABLE_TYPES} — which also means a sign-on/sign-off shell with
 * no air content falls out with the empty shows.
 *
 * Two kinds of entry land in an "Unattributed" block rather than a show of
 * their own, and they are not the same thing:
 *
 *   1. `show_id: null` — Backend reports the row as genuinely unattributed. 20
 *      of 2,619,011 rows are in that state and the tubafrenzy Phase 0 audit
 *      decided against backfilling them, so the endpoint returns them.
 *   2. `show_id` set but absent from `shows` — the window caught the row but not
 *      its show. The endpoint selects shows by overlap and deliberately does not
 *      treat a null `end_time` as open-ended, so a show that started before the
 *      window and never recorded a sign-off is excluded while its entries are
 *      not.
 *
 * Dropping either would silently lose real playlist history, which is the whole
 * point of the page.
 *
 * A show is filed under the Eastern date it *started* on, so an overnight show
 * stays whole rather than splitting at midnight. This differs from the
 * `radioWeek` grid it replaces, which clipped a show to each day it touched and
 * listed the after-midnight half under the following day starting at 12:00 AM —
 * losing the fact that it began the night before, and cutting its playlist in
 * two.
 *
 * @param {{shows: Array, entries: Array}} range Raw range response.
 * @param {string} startDate First day of the window, `YYYY-MM-DD`.
 * @param {number} days Window length in calendar days.
 * @returns {Array<{date: string, shows: Array}>} One element per calendar day,
 *   in order, including days with no shows.
 */
export function groupRangeByDay(range, startDate, days) {
	const shows = range?.shows ?? []
	const entries = range?.entries ?? []

	const showsById = new Map()
	for (const show of shows) {
		showsById.set(show.id, {
			id: show.id,
			djName: show.dj_name || UNATTRIBUTED_DJ_LABEL,
			showName: show.show_name || null,
			startTime: show.start_time,
			endTime: show.end_time,
			entries: [],
		})
	}

	// Keyed by `${date}` so an unattributed run on Tuesday does not merge with
	// one on Friday.
	const unattributedByDate = new Map()

	for (const entry of entries) {
		if (!DISPLAYABLE_TYPES.has(entry.entry_type)) continue
		const block =
			entry.show_id == null ? undefined : showsById.get(entry.show_id)
		if (block) {
			block.entries.push(entry)
			continue
		}
		const date = easternDateOf(entry.add_time)
		if (date === null) continue
		if (!unattributedByDate.has(date)) {
			unattributedByDate.set(date, {
				id: null,
				djName: UNATTRIBUTED_DJ_LABEL,
				showName: null,
				startTime: null,
				endTime: null,
				entries: [],
			})
		}
		unattributedByDate.get(date).entries.push(entry)
	}

	// A show is filed under the Eastern date it started on, so an overnight show
	// stays whole instead of splitting at midnight. `shows` arrives ordered by
	// start_time, so per-day order follows for free.
	const byDate = new Map()
	for (let i = 0; i < days; i++) {
		byDate.set(addDays(startDate, i), [])
	}

	for (const show of shows) {
		const date = easternDateOf(show.start_time)
		// A show that began before the window still appears in `shows` when it
		// overlaps. File it on the first day rather than dropping it.
		const bucket = byDate.has(date) ? date : startDate
		byDate.get(bucket).push(showsById.get(show.id))
	}

	for (const [date, block] of unattributedByDate) {
		if (byDate.has(date)) byDate.get(date).push(block)
	}

	return [...byDate.entries()].map(([date, dayShows]) => ({
		date,
		shows: dayShows.filter((show) => show.entries.length > 0),
	}))
}

/**
 * A show's air time as a display string.
 *
 * @param {{startTime: ?string, endTime: ?string}} show
 * @returns {string} e.g. `1:09 AM – 2:31 AM`, or the empty string when unknown.
 */
export function formatShowTime(show) {
	const start = show.startTime ? formatEasternTime(show.startTime) : ''
	if (!start) return ''
	// A null end_time means either "on the air" or "sign-off was never
	// recorded", and the two are not distinguishable from this field. Render
	// neither claim.
	const end = show.endTime ? formatEasternTime(show.endTime) : ''
	return end ? `${start} – ${end}` : start
}

/**
 * Whether an entry is a played track (as opposed to a talkset, breakpoint, or
 * show delimiter).
 *
 * @param {{entry_type: string}} entry
 * @returns {boolean}
 */
export function isTrack(entry) {
	return entry.entry_type === TRACK
}
