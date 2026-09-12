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
