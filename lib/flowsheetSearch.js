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
	formatCalendarDateNoWeekday,
	formatEasternTime,
} from './easternTime'

/**
 * Rows per page. The endpoint validates `limit` as a positive integer capped
 * at a server-side maximum, so this only needs to be a sane table size, not
 * tuned to that ceiling.
 */
export const DEFAULT_PAGE_SIZE = 25

/**
 * The backend's own count cap (`search.service.ts`'s `COUNT_CAP`). Any query
 * matching more rows than this comes back with `total` pinned at
 * `COUNT_CAP + 1` — a sentinel meaning "more than we counted", not a real
 * count. Verified live: an unqualified search against the ~2.6M-row table
 * (`?limit=25`, the empty-query landing view every visitor sees by default)
 * returns `total: 10001`.
 */
export const SEARCH_COUNT_CAP = 10000

/**
 * `data.total`, rendered so it does not lie. Above the cap it is a sentinel,
 * not a count — see {@link SEARCH_COUNT_CAP} — so it is shown as an
 * open-ended range instead of a fake precise number.
 *
 * @param {number} total
 * @returns {string}
 */
export function formatSearchTotal(total) {
	return total > SEARCH_COUNT_CAP ? '10,000+' : total.toLocaleString()
}

/**
 * Hard ceiling on how deep offset paging will go, independent of whatever
 * the backend's `totalPages` claims is reachable.
 *
 * Deep `OFFSET` scans on this endpoint approach and can exceed the backend's
 * statement timeout. Live probing on `?q=the&limit=25` (a broad query, so a
 * worst case) found: page 200 (offset 5,000) succeeded in 3.01s; page 380
 * (offset 9,500) succeeded in 4.27s; page 400 (offset 10,000) failed with a
 * 500 at 5.21s. A second probe against the same query got a 500 at page 380
 * — where the first got a 200 — so the failing page is not a fixed number,
 * it drifts with database load. There is no page count that is safe to treat
 * as an exact boundary.
 *
 * This clamp is set well back from either observed edge rather than tuned to
 * one of them, trading reachable depth for headroom: at `MAX_REACHABLE_PAGE`
 * the offset is a fraction of the smallest offset that was ever observed to
 * take more than half the statement timeout. The empty-query landing view is
 * index-only on `add_time` and stays fast at much greater depth than this —
 * it is text queries that degrade — but the clamp is applied uniformly to
 * both because a single simple rule is worth more here than a few extra
 * reachable pages on the landing view.
 *
 * The actual fix is switching to the endpoint's cursor-paging mode, which is
 * O(limit) rather than O(page * limit) and so does not have this cliff at
 * all. It is deliberately not used here: `fetchFlowsheetSearch` below picks
 * offset paging and never sends `cursor`, and mixing the two modes within one
 * session produces duplicate or missing rows. Whoever lifts this clamp
 * should switch paging modes instead, not raise the number.
 */
export const MAX_REACHABLE_PAGE = 99

/**
 * Whether the next page is both reported to exist and within the reachable
 * depth clamp.
 *
 * @param {{page: number}} search
 * @param {number} totalPages
 * @returns {boolean}
 */
export function canGoToNextPage(search, totalPages) {
	return search.page + 1 < totalPages && search.page < MAX_REACHABLE_PAGE
}

/**
 * Whether pagination is stopping the listener at the depth clamp rather than
 * at the real end of the results — the case that needs an honest explanation
 * rather than a silently-disabled Next button.
 *
 * @param {{page: number}} search
 * @param {number} totalPages
 * @returns {boolean}
 */
export function isAtDepthLimit(search, totalPages) {
	return search.page >= MAX_REACHABLE_PAGE && search.page + 1 < totalPages
}

/**
 * Field-qualifier prefixes the backend's query parser recognizes
 * (`apps/backend/services/search-parser.service.ts`). Any other colon in a
 * query is a literal character, not syntax.
 */
export const FIELD_PREFIXES = [
	'artist',
	'song',
	'album',
	'label',
	'dj',
	'dateRange',
	'date',
]

/**
 * Matches a recognized field prefix sent with no value after the colon —
 * either at the end of the query or immediately before a boolean keyword.
 * `dateRange` is listed before `date` so the longer prefix matches first.
 */
const EMPTY_FIELD_FILTER_PATTERN = new RegExp(
	`\\b(?:${FIELD_PREFIXES.join('|')}):\\s*($|AND\\b|OR\\b|NOT\\b)`,
	'i'
)

/**
 * True when `query` sends a recognized field prefix with no value
 * (`artist:`, `album: AND label:foo`, …).
 *
 * The backend does not reject this. Verified live: `q=artist:` and
 * `q=album:` each return the same unfiltered most-recent-tracks result as
 * omitting `q` altogether (`total: 10001`, matching first row) — the filter
 * is silently dropped, not applied and not rejected. A listener who mistypes
 * a field filter gets no error and no sign anything was ignored, so the UI
 * has to say so itself.
 *
 * This is a heuristic over the query text, not a parse of the full query
 * grammar: it catches a bare prefix at the end of the string or immediately
 * before a boolean keyword, which is the reported failure mode, but it will
 * not catch every malformed variant.
 *
 * @param {string} query
 * @returns {boolean}
 */
export function hasEmptyFieldFilter(query) {
	if (!query) return false
	return EMPTY_FIELD_FILTER_PATTERN.test(query)
}

/**
 * Normalize a Postgres `timestamptz` text value toward a well-formed
 * ECMA-262 Date Time String before it reaches `Date.parse`.
 *
 * The endpoint returns Postgres's default text form
 * (`2026-07-21 15:47:47.654+00`): a space instead of `T`, and a bare 2-digit
 * UTC offset instead of `+00:00`. Both are outside the ECMA-262 grammar, so a
 * strict parser is entitled to reject the string outright — this only turns
 * it into something every ECMA-262-conformant `Date.parse` is contractually
 * required to accept. Cheap defense: the exact production shape has been
 * checked against V8, JavaScriptCore, and SpiderMonkey and all three already
 * parse it correctly today, so this is a hedge against a spec-legal future
 * divergence, not a fix for an observed one.
 *
 * @param {string} raw
 * @returns {string} The normalized string, or `raw` unchanged if it does not
 *   match the expected shape (so an already-bad input still fails the same
 *   way it did before).
 */
export function normalizePgTimestamp(raw) {
	if (typeof raw !== 'string') return raw
	const match = raw.match(
		/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/
	)
	if (!match) return raw
	const [, datePart, timePart, offsetPart] = match

	let offset = 'Z'
	if (offsetPart && offsetPart !== 'Z') {
		const sign = offsetPart[0]
		const digits = offsetPart.slice(1).replace(':', '')
		const hours = digits.slice(0, 2)
		const minutes = digits.length > 2 ? digits.slice(2, 4) : '00'
		offset = `${sign}${hours}:${minutes}`
	}

	return `${datePart}T${timePart}${offset}`
}

/**
 * Search WXYC's airplay history.
 *
 * Offset paging only (`page`/`limit`) — the endpoint also supports opaque
 * cursor paging, but mixing the two modes in one session produces duplicate
 * or missing rows, so this client picks offset and never sends `cursor`.
 * (See {@link MAX_REACHABLE_PAGE} for what that costs at depth, and why
 * cursor mode — not raising the clamp — is the eventual fix.)
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
 * @throws {Error} On a non-OK response, or a response body that is not valid
 *   JSON.
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
		// The controller only 400s on page < 0, a bad limit, or a malformed
		// cursor — none of which this client can send, since page/limit are
		// always sent as non-negative integers and cursor is never sent at
		// all. So there is nothing query-specific to say here: every non-OK
		// status gets the same generic message.
		throw new Error(`Could not search airplay records (${response.status}).`)
	}

	try {
		return await response.json()
	} catch {
		// A 200 with a body that fails to parse as JSON — e.g. an
		// intermediary returning an HTML error page with a 200 status.
		// `SyntaxError: Unexpected token '<' ...` is not something to put in
		// front of a listener.
		throw new Error(
			'Could not search airplay records: the response was unreadable.'
		)
	}
}

/**
 * A `play_date` timestamp, as a readable Eastern date and time.
 *
 * Built from `lib/easternTime.js`'s existing formatters rather than
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
	const normalized = normalizePgTimestamp(playDate)
	const date = easternDateOf(normalized)
	const time = formatEasternTime(normalized)
	if (!date || !time) return ''
	return `${formatCalendarDateNoWeekday(date)}, ${time}`
}
