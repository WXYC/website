/**
 * Eastern-time calendar helpers for the historical playlist archive.
 *
 * WXYC broadcasts on Eastern time, so a "day" and a "week" are Eastern clock
 * boundaries — not UTC, and emphatically not the visitor's browser timezone. A
 * listener in Los Angeles asking for Tuesday's playlist means Tuesday in Chapel
 * Hill. Everything here therefore takes and returns plain `YYYY-MM-DD` calendar
 * strings and converts to epoch milliseconds only at the edge, where the API
 * needs it.
 *
 * Dates are manipulated with `Date.UTC` rather than the local-time `Date`
 * constructor throughout: `new Date(2024, 0, 15)` means midnight *wherever the
 * browser is*, which puts a visitor east of Greenwich on a different calendar
 * day than the one they asked for.
 */

/** ISO date of the earliest flowsheet week observed in production. */
export const EARLIEST_ARCHIVE_DATE = '2004-11-01'

const EASTERN = 'America/New_York'

/*
 * Formatters are hoisted to module scope because constructing one is expensive
 * relative to using it — measured at ~0.06 ms fresh against ~0.0005 ms reused.
 * A rendered week runs these on the order of 170 times (one date per show, two
 * clock times per show, one heading per day), and `ShowBlock` re-formats on
 * every React re-render, so a per-call constructor is a visible cost on the
 * phone-first surface this page targets.
 */

/**
 * Probe formatter for {@link easternMidnightEpoch}.
 *
 * `hourCycle: 'h23'` is set explicitly rather than relying on `hour12: false`.
 * The two are not synonyms: `hour12: false` leaves the cycle to locale data,
 * and en-US resolved to h24 — which renders midnight as "24", not "00" — in
 * Chrome before 80, Firefox before 76 and Safari before 14. Under h24 the
 * probe below would never match, and the whole page would silently shift by an
 * hour for the eight months a year Eastern is on EDT. The `% 24` in the
 * comparison makes the match hold under either cycle even so.
 */
const HOUR_PROBE = new Intl.DateTimeFormat('en-US', {
	timeZone: EASTERN,
	hour: '2-digit',
	hour12: false,
	hourCycle: 'h23',
})

/** Parts formatter for {@link easternDateOf} — see the note there on padding. */
const EASTERN_DATE_PARTS = new Intl.DateTimeFormat('en-US', {
	timeZone: EASTERN,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
})

const EASTERN_CLOCK = new Intl.DateTimeFormat('en-US', {
	timeZone: EASTERN,
	hour: 'numeric',
	minute: '2-digit',
})

const CALENDAR_DATE = new Intl.DateTimeFormat('en-US', {
	timeZone: 'UTC',
	weekday: 'long',
	month: 'long',
	day: 'numeric',
	year: 'numeric',
})

/**
 * Epoch milliseconds at midnight Eastern on a calendar date.
 *
 * Eastern is UTC-5 (EST) or UTC-4 (EDT) depending on the date, and the
 * changeover is a rule, not arithmetic. Rather than reimplement that rule, this
 * tries both offsets and keeps whichever one actually renders as midnight in
 * `America/New_York` — so it stays correct if the DST rules ever change again,
 * as they did in 2007.
 *
 * @param {string} dateStr Calendar date, `YYYY-MM-DD`.
 * @returns {number} Epoch milliseconds.
 */
export function easternMidnightEpoch(dateStr) {
	const [y, m, d] = dateStr.split('-').map(Number)

	for (const offset of [5, 4]) {
		const candidate = Date.UTC(y, m - 1, d, offset, 0, 0, 0)
		// `% 24` so an h24 runtime, which writes midnight as "24", still matches.
		if (parseInt(HOUR_PROBE.format(new Date(candidate))) % 24 === 0) {
			return candidate
		}
	}

	// Unreachable for America/New_York: one of EST/EDT always applies.
	return Date.UTC(y, m - 1, d, 5, 0, 0, 0)
}

/**
 * Shift a calendar date by whole days.
 *
 * Pure calendar arithmetic — it says nothing about how many hours the interval
 * spans. That is the point: pairing it with {@link easternMidnightEpoch} yields
 * a window whose length is whatever the Eastern calendar says, where adding a
 * fixed number of milliseconds would be wrong by an hour on the two DST
 * transition weeks a year.
 *
 * @param {string} dateStr Calendar date, `YYYY-MM-DD`.
 * @param {number} days Days to add; may be negative.
 * @returns {string} The shifted date, `YYYY-MM-DD`.
 */
export function addDays(dateStr, days) {
	const [y, m, d] = dateStr.split('-').map(Number)
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * The Monday of the week containing a date.
 *
 * Weeks run Monday through Sunday, matching the `radioWeek` page this replaces.
 *
 * @param {string} dateStr Calendar date, `YYYY-MM-DD`.
 * @returns {string} That week's Monday, `YYYY-MM-DD`.
 */
export function startOfWeek(dateStr) {
	const [y, m, d] = dateStr.split('-').map(Number)
	// getUTCDay(): 0 = Sunday. Sunday belongs to the week that began six days
	// earlier, not the one starting tomorrow.
	const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
	return addDays(dateStr, weekday === 0 ? -6 : 1 - weekday)
}

/**
 * Today's calendar date in Eastern time.
 *
 * @param {Date} [now] Instant to resolve; defaults to the present.
 * @returns {string} `YYYY-MM-DD`.
 */
export function easternToday(now = new Date()) {
	return easternDateKey(now)
}

/**
 * Format an instant as a zero-padded Eastern `YYYY-MM-DD`.
 *
 * Assembled from `formatToParts` rather than by formatting the 'en-CA' locale,
 * whose short-date pattern happens to be `YYYY-MM-DD` today but is CLDR data
 * rather than a specification guarantee. That distinction is load-bearing:
 * these keys are looked up against day buckets built by {@link addDays}, which
 * produces zero-padded ISO from `toISOString`. If the two producers ever
 * disagreed by so much as a leading zero, every lookup would miss — dropping
 * all unattributed entries and collapsing the entire week onto its first day.
 * Building both from explicit padded numbers removes the coupling.
 *
 * @param {Date} instant
 * @returns {string} `YYYY-MM-DD`.
 */
function easternDateKey(instant) {
	const parts = {}
	for (const {type, value} of EASTERN_DATE_PARTS.formatToParts(instant)) {
		parts[type] = value
	}
	return [
		parts.year.padStart(4, '0'),
		parts.month.padStart(2, '0'),
		parts.day.padStart(2, '0'),
	].join('-')
}

/**
 * A calendar date as a human-readable Eastern date.
 *
 * Formatted from a UTC-noon instant so no timezone the browser might be in can
 * roll it onto the neighbouring day.
 *
 * @param {string} dateStr Calendar date, `YYYY-MM-DD`.
 * @param {object} [options] `Intl.DateTimeFormat` options to override.
 * @returns {string} e.g. `Wednesday, August 5, 2026`.
 */
export function formatCalendarDate(dateStr, options) {
	const [y, m, d] = dateStr.split('-').map(Number)
	const noon = new Date(Date.UTC(y, m - 1, d, 12))
	if (!options) return CALENDAR_DATE.format(noon)
	return new Intl.DateTimeFormat('en-US', {
		timeZone: 'UTC',
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		...options,
	}).format(noon)
}

/**
 * An instant as an Eastern clock time.
 *
 * @param {string} isoTimestamp ISO 8601 timestamp.
 * @returns {string} e.g. `1:09 AM`, or the empty string if unparseable.
 */
export function formatEasternTime(isoTimestamp) {
	const ms = Date.parse(isoTimestamp)
	if (Number.isNaN(ms)) return ''
	return EASTERN_CLOCK.format(new Date(ms))
}

/**
 * The Eastern calendar date an instant falls on.
 *
 * Used to bucket a week's entries into days: the row's `add_time` is a UTC
 * instant, and bucketing it by anything other than its Eastern date would put
 * everything after 7 or 8 PM on the following day.
 *
 * @param {string} isoTimestamp ISO 8601 timestamp.
 * @returns {string|null} `YYYY-MM-DD`, or null if unparseable.
 */
export function easternDateOf(isoTimestamp) {
	const ms = Date.parse(isoTimestamp)
	if (Number.isNaN(ms)) return null
	return easternDateKey(new Date(ms))
}

/**
 * The week to show for a requested date, clamped to the archive's extent.
 *
 * The navigation buttons already refuse to run off either end, but they are not
 * the only way in: `?week=` accepts anything, and `<input type="date">` fires
 * `onChange` on every keystroke of a typed year, so editing "2026" emits 0002,
 * 0020, 0202 and 2026 in turn — `min`/`max` constrain the picker's UI, not the
 * values it reports. Without a clamp here, each of those is a live range query
 * against a 2.6-million-row production table for a week that cannot exist.
 *
 * Clamping rather than rejecting: someone deep-linking to 1998 wants the oldest
 * playlists we have, and the first week of the archive is a better answer than
 * an error.
 *
 * @param {string} dateStr Calendar date, `YYYY-MM-DD`.
 * @param {string} [today] Eastern today, `YYYY-MM-DD`; defaults to the present.
 * @returns {string} A Monday within the archive, `YYYY-MM-DD`.
 */
export function clampWeekToArchive(dateStr, today = easternToday()) {
	const week = startOfWeek(dateStr)
	const earliest = startOfWeek(EARLIEST_ARCHIVE_DATE)
	const latest = startOfWeek(today)
	if (week < earliest) return earliest
	if (week > latest) return latest
	return week
}
