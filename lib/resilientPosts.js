import {fetchAllEdges, TINA_PAGE_SIZE} from './tinaPagination'

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
 * same one the per-post pages use — then fetch each document individually,
 * skipping (and logging) any that still fail.
 *
 * @param {Object} opts
 * @param {object} opts.client      the generated Tina client (`tina/__generated__/client`)
 * @param {string} opts.collection  collection name, e.g. 'blog' or 'archive'
 * @param {string} opts.fields      node sub-selection, e.g. 'id title cover ...'
 * @param {string} opts.label       label used in build-log warnings
 * @returns {Promise<object[]>} array of node objects (unsorted)
 */
export async function fetchCollectionNodes({
	client,
	collection,
	fields,
	label,
}) {
	const connection = `${collection}Connection`

	const walk = (selection) => (after) =>
		client
			.request({
				query: `
					query ResilientWalk($first: Float, $after: String) {
						${connection}(first: $first, after: $after) {
							edges { node { ${selection} } }
							pageInfo { hasNextPage endCursor }
						}
					}
				`,
				variables: {first: TINA_PAGE_SIZE, after},
			})
			.then(({data}) => {
				// A broken index can return a 200 with `{data: {<connection>: null},
				// errors: [...]}`, which the Tina client resolves rather than rejects.
				// Throw so this is treated as a failure (triggering the fallback /
				// degrading to an empty listing below) rather than an empty page —
				// returning an empty page here would let a null on page 2+ silently
				// truncate a multi-page walk to whatever was gathered so far.
				const conn = data?.[connection]
				if (!conn) throw new Error(`"${connection}" returned no data`)
				return conn
			})

	try {
		const edges = await fetchAllEdges(walk(fields))
		return edges.map((edge) => edge.node)
	} catch (err) {
		console.warn(
			`[${label}] full connection walk failed (${err.message}); ` +
				'falling back to per-document fetch'
		)
	}

	let fileEdges
	try {
		fileEdges = await fetchAllEdges(walk('_sys { filename }'))
	} catch (err) {
		// Even the lightweight filename-only walk failed (e.g. a persistently
		// null connection). Degrade to an empty listing rather than crashing the
		// whole static export — that is the entire point of this module.
		console.warn(
			`[${label}] filename walk also failed (${err.message}); returning no documents`
		)
		return []
	}
	const nodes = []
	const skipped = []
	for (const {node} of fileEdges) {
		const filename = node?._sys?.filename
		if (!filename) {
			console.warn(`[${label}] skipping an edge with no _sys.filename`)
			continue
		}
		try {
			const res = await client.queries[collection]({
				relativePath: `${filename}.md`,
			})
			nodes.push(res.data[collection])
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
 * Milliseconds since epoch for a node's `published` date, or `NaN` when it is
 * missing or unparseable. `NaN` (not 0) is the sentinel so that a genuinely
 * valid date — including the Unix epoch or any pre-1970 date — is never
 * confused with "no date".
 */
function publishedTime(node) {
	return Date.parse(node?.published)
}

/** Ascending filename comparison, used as a stable tiebreak. */
function byFilename(a, b) {
	const fa = a?._sys?.filename ?? ''
	const fb = b?._sys?.filename ?? ''
	return fa < fb ? -1 : fa > fb ? 1 : 0
}

/**
 * Return a new array of nodes ordered newest-first by `published`, breaking
 * ties by filename so the order is deterministic across builds. Nodes with a
 * missing or invalid `published` sort to the end. Does not mutate the input.
 */
export function sortByPublishedDesc(nodes) {
	return [...nodes].sort((a, b) => {
		const ta = publishedTime(a)
		const tb = publishedTime(b)
		if (Number.isNaN(ta) && Number.isNaN(tb)) return byFilename(a, b)
		if (Number.isNaN(ta)) return 1
		if (Number.isNaN(tb)) return -1
		if (tb !== ta) return tb - ta
		return byFilename(a, b)
	})
}

/**
 * Keep nodes whose `published` falls in the window `(after, before)`. Both
 * bounds are exclusive, matching Tina's datetime filter (`after` => `gt`,
 * `before` => `lt`); either may be omitted (treated as unbounded). Nodes with a
 * missing or invalid `published` are dropped.
 *
 * @param {object[]} nodes
 * @param {{after?: Date|string|number, before?: Date|string|number}} [window]
 */
export function filterByPublishedWindow(nodes, {after, before} = {}) {
	const lo = after == null ? -Infinity : new Date(after).getTime()
	const hi = before == null ? Infinity : new Date(before).getTime()
	return nodes.filter((node) => {
		const time = publishedTime(node)
		return !Number.isNaN(time) && time > lo && time < hi
	})
}

/**
 * Keep nodes that reference a category whose title exactly matches `title`.
 * Tolerates the nested, polymorphic TinaCMS category reference shape
 * (`node.categories[].category.title`) and a missing `categories` array.
 */
export function filterByCategoryTitle(nodes, title) {
	return nodes.filter((node) =>
		node.categories?.some((entry) => entry?.category?.title === title)
	)
}
