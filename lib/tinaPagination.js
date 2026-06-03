/**
 * Tina's connection queries cap each response at 50 edges, regardless of
 * what `first`/`last` is passed. To retrieve every document in a collection,
 * walk cursors with `first: 50, after: $cursor` until `pageInfo.hasNextPage`
 * is false.
 *
 * `fetchPage(after)` should issue one connection query and return its result
 * (an object with `edges` and `pageInfo { hasNextPage, endCursor }`).
 */
export const TINA_PAGE_SIZE = 50

// Tina has fewer than this many docs per collection; if a build ever walks
// past this, something is wrong with pageInfo (e.g. a non-advancing cursor)
// and we'd rather fail than hang the CI job indefinitely.
const MAX_PAGES = 200

export async function fetchAllEdges(fetchPage) {
	const edges = []
	let after = null
	for (let page = 0; page < MAX_PAGES; page++) {
		const conn = await fetchPage(after)
		edges.push(...conn.edges)
		if (!conn.pageInfo.hasNextPage) return edges
		if (conn.pageInfo.endCursor === after) {
			throw new Error(
				`Tina connection cursor did not advance past ${after} — refusing to loop`
			)
		}
		after = conn.pageInfo.endCursor
	}
	throw new Error(
		`Tina connection exceeded ${MAX_PAGES} pages (${
			MAX_PAGES * TINA_PAGE_SIZE
		}+ edges) — aborting walk`
	)
}
