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
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York',
		hour: '2-digit',
		hour12: false,
	})

	for (const offset of [5, 4]) {
		const candidate = Date.UTC(y, m - 1, d, offset, 0, 0, 0)
		if (parseInt(formatter.format(new Date(candidate))) === 0) {
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
	// 'en-CA' renders as YYYY-MM-DD, which is the format we want anyway.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/New_York',
	}).format(now)
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
	return new Intl.DateTimeFormat('en-US', {
		timeZone: 'UTC',
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		...options,
	}).format(new Date(Date.UTC(y, m - 1, d, 12)))
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
	return new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York',
		hour: 'numeric',
		minute: '2-digit',
	}).format(new Date(ms))
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
	return easternToday(new Date(ms))
}
