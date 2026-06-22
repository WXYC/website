import {fetchAllEdges} from './tinaPagination'

/**
 * Fetch every node from a Tina collection WITHOUT relying on Tina Cloud's
 * server-side `sort: "published"` or `filter: {published: ...}`.
 *
 * Why this exists: a single document whose indexed `published` value is missing
 * or stale makes those server-side operations throw
 * `Error querying file <name> from collection <collection>`, which fails the
 * entire `next build` static export and freezes the GitHub Pages deploy.
 * Editors trip this routinely by creating, deleting, or re-saving posts, so the
 * whole site stops updating until someone re-indexes the content. We instead
 * pull documents with index-tolerant queries and do all ordering/windowing in
 * JS (see `sortByPublishedDesc` / `filterByPublishedWindow`), so one bad post
 * can demote or drop itself but can never break the build.
 *
 * Happy path: walk the collection unsorted, requesting the display `fields`.
 * Fallback (only if that walk throws): walk unsorted requesting just the
 * filename — the one query shape proven to resolve against a broken index, the
 * same one the per-post pages use — then fetch each document individually via
 * `fetchOne`, skipping (and logging) any that still fail.
 *
 * @param {Object} opts
 * @param {string} opts.connection  Tina connection field, e.g. 'blogConnection'
 * @param {string} opts.fields      node sub-selection, e.g. 'id title cover ...'
 * @param {(q: {query: string, variables: object}) => Promise<{data: object}>} opts.request
 *        issues one GraphQL request (pages pass `(q) => client.request(q)`)
 * @param {(filename: string) => Promise<object>} opts.fetchOne
 *        fetches a single document by filename (pages pass a `client.queries.*` call)
 * @param {string} opts.label       label used in build-log warnings
 * @returns {Promise<object[]>} array of node objects (unsorted)
 */
export async function fetchCollectionNodes({
	connection,
	fields,
	request,
	fetchOne,
	label,
}) {
	const walk = (selection) => (after) =>
		request({
			query: `
				query ResilientWalk($first: Float, $after: String) {
					${connection}(first: $first, after: $after) {
						edges { node { ${selection} } }
						pageInfo { hasNextPage endCursor }
					}
				}
			`,
			variables: {first: 50, after},
		}).then(({data}) => data[connection])

	try {
		const edges = await fetchAllEdges(walk(fields))
		return edges.map((edge) => edge.node)
	} catch (err) {
		console.warn(
			`[${label}] full connection walk failed (${err.message}); ` +
				'falling back to per-document fetch'
		)
	}

	const fileEdges = await fetchAllEdges(walk('_sys { filename }'))
	const nodes = []
	const skipped = []
	for (const {node} of fileEdges) {
		const filename = node?._sys?.filename
		try {
			nodes.push(await fetchOne(filename))
		} catch (err) {
			skipped.push(filename)
			console.warn(`[${label}] skipping "${filename}": ${err.message}`)
		}
	}
	if (skipped.length) {
		console.warn(
			`[${label}] ${skipped.length} document(s) skipped: ${skipped.join(', ')}`
		)
	}
	return nodes
}

/**
 * Milliseconds since epoch for a node's `published` date, or 0 when it is
 * missing or unparseable (so such nodes sort last and fall outside any window).
 */
function publishedTime(node) {
	const time = Date.parse(node?.published)
	return Number.isNaN(time) ? 0 : time
}

/**
 * Return a new array of nodes ordered newest-first by `published`. Nodes with a
 * missing or invalid `published` sort to the end. Does not mutate the input.
 */
export function sortByPublishedDesc(nodes) {
	return [...nodes].sort((a, b) => publishedTime(b) - publishedTime(a))
}

/**
 * Keep nodes whose `published` falls in the half-open window `[after, before)`.
 * Either bound may be omitted (treated as unbounded). Nodes with a missing or
 * invalid `published` are dropped.
 *
 * @param {object[]} nodes
 * @param {{after?: Date|string|number, before?: Date|string|number}} [window]
 */
export function filterByPublishedWindow(nodes, {after, before} = {}) {
	const lo = after == null ? -Infinity : new Date(after).getTime()
	const hi = before == null ? Infinity : new Date(before).getTime()
	return nodes.filter((node) => {
		const time = publishedTime(node)
		return time > 0 && time >= lo && time < hi
	})
}
