/**
 * Client for Backend-Service's public `GET /flowsheet`, the paginated read of
 * the most recent flowsheet entries.
 *
 * One of three sibling clients, one per public flowsheet endpoint:
 * `lib/flowsheetRange.js` (`/flowsheet/range`, week windows for the archive),
 * `lib/flowsheetSearch.js` (`/flowsheet/search`, free text), and this one.
 * `API_BASE` and the entry-shape helpers live in `flowsheetRange.js` and are
 * shared from there rather than duplicated.
 *
 * Contract: `wxyc-shared/api.yaml` `/flowsheet`. Successor to tubafrenzy's
 * `/playlists/recent`, which dies at the 2026-09-07 cutover.
 */

import {API_BASE} from './flowsheetRange'

/**
 * Rows per request. The live page shows one page and does not walk deeper,
 * so this is a window size rather than a pagination step.
 */
export const PAGE_LIMIT = 50

/**
 * Marks a message as curated copy from {@link fetchRecentFlowsheet} itself,
 * as opposed to a raw message bubbling up from `fetch()` or `response.json()`.
 * A network failure, a CORS rejection, or a non-JSON body all reject with a
 * browser-authored `Error` whose `message` is technical ("Failed to fetch",
 * `Unexpected token '<'...`) and unfit for a public error state. Only a
 * `FlowsheetFetchError` message is safe to render verbatim; every other
 * rejection collapses to a generic fallback — see the `catch` in `load` in
 * `pages/playlist.jsx`.
 *
 * Exported because the page throws it too: a 200 whose body is missing its
 * `entries` array is a contract break, not a transport failure, and it has to
 * reach the same "safe to show" branch as a bad status.
 */
export class FlowsheetFetchError extends Error {}

/**
 * Fetch the most recent page of the flowsheet.
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {typeof fetch} [options.fetchImpl] Injectable fetch, for tests.
 * @returns {Promise<{entries: Array, total: number, page: number, limit: number, totalPages: number, on_air: ?{dj_name: ?string}}>}
 * @throws {FlowsheetFetchError} On a non-OK response.
 */
export async function fetchRecentFlowsheet(options = {}) {
	const {signal, fetchImpl = fetch} = options

	const response = await fetchImpl(
		`${API_BASE}/flowsheet?page=0&limit=${PAGE_LIMIT}`,
		{
			// Public, anonymous read — no session to send, and sending one would
			// defeat the origin-scoped CORS allowlist Backend-Service exposes to
			// wxyc.org.
			credentials: 'omit',
			signal,
		}
	)

	if (!response.ok) {
		throw new FlowsheetFetchError(
			`Could not load the playlist (${response.status}).`
		)
	}

	return response.json()
}

/**
 * Rejection from {@link fetchSet} for a set the endpoint has no rows for.
 *
 * Deliberately not a {@link FlowsheetFetchError}: Backend answers the
 * `shows_limit` branch with `404 {"message": "No Tracks found"}` whenever the
 * selected show has no entries, and that covers two situations that are both
 * ordinary — paging past the oldest show in the archive, and a show that was
 * opened and closed with nothing logged. Neither is an outage, and neither
 * should put an error state in front of a listener.
 *
 * It is also, on this endpoint, not a signal that the archive has ended: the
 * two cases are indistinguishable from the status alone. A caller must not
 * read it as a floor and disable navigation on it — a single empty show
 * somewhere in the middle of the archive would otherwise become a permanent
 * wall telling the reader they had reached the beginning of WXYC's history
 * when they had not.
 */
export class EmptySetError extends Error {}

/**
 * Fetch one whole set — every row of a single DJ's show.
 *
 * `shows_limit` is what makes this set pagination rather than row pagination.
 * Backend routes it to `getNShows(numberOfShows, page)`, which is
 * `ORDER BY shows.id DESC OFFSET page * numberOfShows LIMIT numberOfShows`,
 * then returns every entry belonging to the shows it selected
 * (`flowsheet.controller.ts`). With `shows_limit=1`, page 0 is the current or
 * most recent show and page N is the Nth show before it, whatever length each
 * one happens to be.
 *
 * Two ways this branch's response differs from the default one, both of which
 * a client written against the envelope would get wrong:
 *
 *   1. It responds with a **bare array** — `projectEntriesV2(entries)`
 *      directly. There is no `total`, no `page`, no `totalPages` and no
 *      `on_air`.
 *   2. It responds **404** for a set with no rows. See {@link EmptySetError}.
 *
 * Entry order is not guaranteed by the caller's contract with this function.
 * Backend happens to order this branch `desc(play_order), desc(id)`, but the
 * caller sorts with `compareEntriesByAirOrderDesc` regardless, so both views
 * on the page are ordered by one rule of ours rather than by two that happen
 * to agree — one of which is not ours to rely on.
 *
 * That rule is newest-first, which is a deliberate divergence from how the
 * archive page renders a show. `groupRangeByDay` sorts a show's entries
 * ascending, and dj-site's show view does the same; a set read on its own
 * reads in the order it aired. This page is not that page. Its landing view
 * is the most recent rows of the flowsheet, newest at the top, and a reader
 * who steps back one set should not have the list invert under them. The
 * reading direction is a property of the page, not of the set.
 *
 * @param {number} page Zero-based set depth; 0 is the most recent set.
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {typeof fetch} [options.fetchImpl] Injectable fetch, for tests.
 * @returns {Promise<Array>} The set's entries, as the endpoint sent them.
 * @throws {EmptySetError} When the set has no rows.
 * @throws {FlowsheetFetchError} On any other non-OK response, or a body that
 *   is not the documented array.
 */
export async function fetchSet(page, options = {}) {
	const {signal, fetchImpl = fetch} = options

	const response = await fetchImpl(
		`${API_BASE}/flowsheet?shows_limit=1&page=${page}`,
		{credentials: 'omit', signal}
	)

	if (response.status === 404) {
		throw new EmptySetError('Nothing was logged for this set.')
	}

	if (!response.ok) {
		throw new FlowsheetFetchError(
			`Could not load that set (${response.status}).`
		)
	}

	const body = await response.json()

	if (!Array.isArray(body)) {
		// A non-array body is a shape regression, not an empty set. Rendering
		// it as "nothing aired" would be a confident lie about a radio show.
		throw new FlowsheetFetchError(
			'Could not load that set (unexpected response shape).'
		)
	}

	return body
}

/** Entry types that carry a `dj_name` on the V2 wire. */
const DJ_BEARING_TYPES = new Set([
	'show_start',
	'show_end',
	'dj_join',
	'dj_leave',
])

/**
 * Who was on the air for a set, and between what times.
 *
 * The `shows_limit` branch returns no `shows` metadata, so this is derived
 * from the set's own delimiter rows — the second independent signal
 * `api.yaml` names for a show's extent, alongside the `shows` table's
 * `start_time`/`end_time` columns.
 *
 * A null `endTime` is left null rather than resolved to "on the air now". The
 * two causes — the show is genuinely live, and its `show_end` delivery was
 * dropped and nothing re-closes it — are not distinguishable from here, and
 * `api.yaml` says so explicitly about the equivalent column.
 *
 * The DJ is resolved sign-on, then sign-off, then any other marker row,
 * because a set can arrive without a `show_start` (a dropped delivery, or a
 * window that begins mid-show). The order matters: a `dj_join` names the
 * *guest* who arrived partway through, not the DJ whose set this is, so it is
 * consulted only when neither delimiter survives. And it is marker rows all
 * the way down — track rows carry no `dj_name` on the V2 wire at all, since
 * `flowsheet.dj_name` on a track row exists for the search service's hot path
 * rather than for display, and Backend's projection omits it accordingly.
 *
 * @param {Array<{entry_type: string, dj_name: ?string, add_time: ?string}>} entries
 * @returns {{djName: ?string, startTime: ?string, endTime: ?string}}
 */
export function describeSet(entries) {
	const rows = entries ?? []
	const signOn = rows.find((entry) => entry.entry_type === 'show_start')
	const signOff = rows.find((entry) => entry.entry_type === 'show_end')
	const named = rows.find(
		(entry) => DJ_BEARING_TYPES.has(entry.entry_type) && entry.dj_name
	)

	return {
		djName: signOn?.dj_name || signOff?.dj_name || named?.dj_name || null,
		startTime: signOn?.add_time ?? null,
		endTime: signOff?.add_time ?? null,
	}
}
