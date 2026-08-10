/**
 * Client for Backend-Service's public `GET /flowsheet/search`, plus the
 * play-date formatting the airplay-search page renders.
 *
 * Contract: `wxyc-shared/api.yaml` `/flowsheet/search`. Successor to
 * tubafrenzy's `/playlists/searchPlaylists`, which dies at the 2026-08-31
 * cutover.
 */

import {API_BASE} from './flowsheetRange'
import {
	easternDateOf,
	formatCalendarDate,
	formatEasternTime,
} from './easternTime'

export {API_BASE}

/**
 * Rows per page. The endpoint validates `limit` as a positive integer capped
 * at a server-side maximum, so this only needs to be a sane table size, not
 * tuned to that ceiling.
 */
export const DEFAULT_PAGE_SIZE = 25

/**
 * Search WXYC's airplay history.
 *
 * Offset paging only (`page`/`limit`) — the endpoint also supports opaque
 * cursor paging, but mixing the two modes in one session produces duplicate
 * or missing rows, so this client picks offset and never sends `cursor`.
 *
 * @param {object} [params]
 * @param {string} [params.q] Free-text or field-qualified query
 *   (`artist:foo AND album:"bar"`). Omitted entirely when blank, which is
 *   what makes the backend serve its most-recent-tracks default — the
 *   landing state for an empty search box.
 * @param {number} [params.page] Zero-based page number.
 * @param {number} [params.limit] Rows per page.
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] Abort signal for the request.
 * @param {typeof fetch} [options.fetchImpl] Injectable fetch, for tests.
 * @returns {Promise<{results: Array, total: number, page: number, totalPages: number}>}
 * @throws {Error} On a non-OK response.
 */
export async function fetchFlowsheetSearch(params = {}, options = {}) {
	const {q = '', page = 0, limit = DEFAULT_PAGE_SIZE} = params
	const {signal, fetchImpl = fetch} = options

	const url = new URL(`${API_BASE}/flowsheet/search`)
	const trimmed = q.trim()
	if (trimmed) url.searchParams.set('q', trimmed)
	url.searchParams.set('page', String(page))
	url.searchParams.set('limit', String(limit))

	const response = await fetchImpl(url.toString(), {
		// This is a public read on a public site. Sending cookies would both
		// be pointless and defeat the wildcard-free CORS allowlist.
		credentials: 'omit',
		signal,
	})

	if (!response.ok) {
		throw new Error(
			response.status === 400
				? 'That search query could not be understood. Try a simpler search.'
				: `Could not search airplay records (${response.status}).`
		)
	}

	return response.json()
}

/**
 * A `play_date` timestamp, as a readable Eastern date and time.
 *
 * The endpoint returns Postgres's raw text form (`2026-07-21
 * 15:47:47.654+00`), which `Date.parse` accepts but no listener should have
 * to read. Built from `lib/easternTime.js`'s existing formatters rather than
 * introducing a second date-formatting path: {@link easternDateOf} resolves
 * the Eastern calendar day the instant falls on (not the UTC day, which
 * would misfile anything within a few hours of midnight), and the day and
 * time are rendered with the same formatters the playlist archive page uses.
 *
 * @param {?string} playDate
 * @returns {string} e.g. `July 21, 2026, 11:47 AM`, or the empty string if
 *   `playDate` is missing or unparsable.
 */
export function formatPlayDate(playDate) {
	if (!playDate) return ''
	const date = easternDateOf(playDate)
	const time = formatEasternTime(playDate)
	if (!date || !time) return ''
	// `weekday: undefined` drops the weekday from the otherwise-full calendar
	// format — the same trick the archive page uses for "Week of August 3,
	// 2026" — since a search-results table is dense enough without it.
	return `${formatCalendarDate(date, {weekday: undefined})}, ${time}`
}
