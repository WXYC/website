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

export async function fetchAllEdges(fetchPage) {
	const edges = []
	let after = null
	while (true) {
		const conn = await fetchPage(after)
		edges.push(...conn.edges)
		if (!conn.pageInfo.hasNextPage) return edges
		after = conn.pageInfo.endCursor
	}
}
