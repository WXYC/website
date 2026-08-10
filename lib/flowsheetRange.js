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

/** Heading for the block holding entries with no usable show. */
export const UNATTRIBUTED_DJ_LABEL = 'Unattributed'

/**
 * Heading for a real show whose DJ handle did not resolve.
 *
 * Deliberately not {@link UNATTRIBUTED_DJ_LABEL}. `dj_name` is nullable by
 * contract — the PII-safe chain runs per-show override -> `user.djName` ->
 * `shows.legacy_dj_name` -> null — so a genuine show can arrive without a
 * handle. "This show's DJ is unknown" and "these rows belong to no show" are
 * different facts and should not share a word on screen.
 */
export const UNKNOWN_DJ_LABEL = 'Unknown DJ'

/** Backend entry types that carry a played track. */
const TRACK = 'track'

/**
 * Entry types that are worth a row.
 *
 * This has to be built against `api.yaml`'s full `FlowsheetEntryType` enum
 * rather than the types a sampled day happens to contain, because the failure
 * mode of an omission here is silence — the row simply never appears. The
 * enum's eight members are track, show_start, show_end, dj_join, dj_leave,
 * talkset, breakpoint, message.
 *
 * `dj_join` / `dj_leave` are included. They are easy to miss (they only occur
 * when a guest DJ joins mid-set — five sampled production weeks hold 25 of
 * them, a single day usually none) and they are real air events: a second DJ
 * arriving partway through a show is exactly the kind of thing a playlist
 * archive should record.
 *
 * `show_start` / `show_end` are the only deliberate exclusions. They restate
 * what the show header already says — who signed on, and when — so rendering
 * them inside the show they delimit is pure duplication. Excluding them here
 * rather than at render time also makes "does this show have anything to
 * display" a simple emptiness check: a show whose only rows are its own two
 * delimiters is a sign-on/sign-off shell with no air content, and drops out.
 * Production runs one to three of those a week out of roughly sixty shows.
 */
const DISPLAYABLE_TYPES = new Set([
	'track',
	'talkset',
	'breakpoint',
	'message',
	'dj_join',
	'dj_leave',
])

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
 *      decided against backfilling them, so the endpoint returns them. This
 *      case is expected and permanent.
 *   2. `show_id` set but absent from `shows` — defence only. Backend's
 *      `getShowsInTimeWindow` ORs three arms, the third being `shows.id IN
 *      (SELECT DISTINCT show_id FROM flowsheet WHERE add_time in window)`,
 *      added precisely so every `show_id` an in-window entry references
 *      resolves. So this should not fire against a correct Backend, and it is
 *      NOT — as an earlier revision of this comment claimed — the ordinary
 *      consequence of a dropped `show_end`; that gap is what the third arm
 *      closes. Kept because the alternative to a catch-all is dropping real
 *      playlist history on the floor if the contract ever regresses.
 *
 * A show is filed under the Eastern date it *started* on, so an overnight show
 * stays whole rather than splitting at midnight. This differs from the
 * `radioWeek` grid it replaces, which clipped a show to each day it touched and
 * listed the after-midnight half under the following day starting at 12:00 AM —
 * losing the fact that it began the night before, and cutting its playlist in
 * two.
 *
 * Within a show, entries are ordered by `play_order`, not by the `add_time`
 * order the endpoint returns them in. Those two disagree often — 88 times
 * across 36 of the 54 shows in a sampled production week — because a DJ can
 * insert a row after the fact. The clearest case: a DJ who forgets the 1 PM and
 * 2 PM breakpoints and adds them both at 2:54 PM gets rows whose `play_order`
 * is 2 and 3 but whose `add_time` is later than everything up to `play_order`
 * 18. Rendering in arrival order strands two hour markers in the middle of the
 * 3 PM hour. `play_order` is the DJ's stated air order and is what a playlist
 * archive is claiming to show.
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
			djName: show.dj_name || UNKNOWN_DJ_LABEL,
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

	for (const block of showsById.values()) {
		// `play_order`, not arrival order — see this function's docstring.
		block.entries.sort((a, b) => a.play_order - b.play_order)
	}

	// A show is filed under the Eastern date it started on, so an overnight show
	// stays whole instead of splitting at midnight.
	const byDate = new Map()
	for (let i = 0; i < days; i++) {
		byDate.set(addDays(startDate, i), [])
	}

	for (const show of shows) {
		const block = showsById.get(show.id)
		const startDay = easternDateOf(show.start_time)
		// A show can appear in `shows` with a `start_time` outside the window: the
		// endpoint also returns every show an in-window entry points at, and one
		// production case has a breakpoint filed against a show that started a
		// week and a half later. Filing those by start date is impossible, so file
		// them by the day their in-window content actually landed on — which is
		// also right for the ordinary case of a show that began late the previous
		// Sunday, since its first in-window entry is after Monday midnight.
		const bucket = byDate.has(startDay)
			? startDay
			: firstEntryDate(block) ?? startDate
		byDate.get(bucket).push(block)
	}

	for (const [date, block] of unattributedByDate) {
		if (byDate.has(date)) byDate.get(date).push(block)
	}

	return [...byDate.entries()].map(([date, dayShows]) => ({
		date,
		// Ordered by when each block first went to air. `shows` arrives sorted by
		// start_time, but neither an unattributed run (which has no start_time and
		// would otherwise be appended after a show that signed on at 11 PM) nor a
		// block bucketed by its entries rather than its start can rely on that.
		shows: dayShows
			.filter((show) => show.entries.length > 0)
			.sort((a, b) => firstEntryTime(a) - firstEntryTime(b)),
	}))
}

/** Earliest `add_time` among a block's entries, as epoch ms. */
function firstEntryTime(block) {
	let earliest = Infinity
	for (const entry of block.entries) {
		const ms = Date.parse(entry.add_time)
		if (!Number.isNaN(ms) && ms < earliest) earliest = ms
	}
	return earliest
}

/** Eastern date a block's earliest entry falls on, or null if it has none. */
function firstEntryDate(block) {
	const earliest = firstEntryTime(block)
	if (!Number.isFinite(earliest)) return null
	return easternDateOf(new Date(earliest).toISOString())
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
 * Whether an entry is a played track (as opposed to a talkset, breakpoint,
 * DJ arrival, or show delimiter).
 *
 * @param {{entry_type: string}} entry
 * @returns {boolean}
 */
export function isTrack(entry) {
	return entry.entry_type === TRACK
}

/**
 * The line to show for an entry that is not a track.
 *
 * `dj_join` / `dj_leave` carry no `message`; their content is the `dj_name` of
 * the DJ arriving or leaving mid-show, so they are rendered from that instead
 * of falling back to a bare type name.
 *
 * @param {{entry_type: string, message: ?string, dj_name: ?string}} entry
 * @returns {string}
 */
export function describeNonTrackEntry(entry) {
	if (entry.entry_type === 'dj_join') {
		return entry.dj_name ? `${entry.dj_name} joined` : 'DJ joined'
	}
	if (entry.entry_type === 'dj_leave') {
		return entry.dj_name ? `${entry.dj_name} left` : 'DJ left'
	}
	return entry.message || entry.entry_type.replace(/_/g, ' ')
}
