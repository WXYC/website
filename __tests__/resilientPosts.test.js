import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {
	fetchCollectionNodes,
	sortByPublishedDesc,
	filterByPublishedWindow,
	filterByCategoryTitle,
} from '../lib/resilientPosts'

// Build a mock Tina `client` whose `request` returns one connection page per
// matching query. `byQuery` maps a substring of the GraphQL query to the
// connection payload it should resolve (or an Error to reject with), letting a
// test make the full-field walk fail while the filename-only walk succeeds.
// `queries[collection]` is the per-document fallback fetch.
function mockClient(connection, byQuery, queries = {}) {
	return {
		request: vi.fn(({query}) => {
			for (const [needle, payload] of byQuery) {
				if (query.includes(needle)) {
					if (payload instanceof Error) return Promise.reject(payload)
					return Promise.resolve({data: {[connection]: payload}})
				}
			}
			throw new Error(`unexpected query: ${query}`)
		}),
		queries,
	}
}

const page = (edges) => ({
	edges,
	pageInfo: {hasNextPage: false, endCursor: null},
})

const node = (filename, fields = {}) => ({node: {_sys: {filename}, ...fields}})

describe('resilientPosts', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.spyOn(console, 'warn').mockImplementation(() => {})
	})

	afterEach(() => {
		// Restore the console.warn spy so it can't leak into sibling test files.
		vi.restoreAllMocks()
	})

	describe('sortByPublishedDesc', () => {
		it('orders newest first', () => {
			const nodes = [
				{title: 'old', published: '2024-01-01'},
				{title: 'new', published: '2026-06-01'},
				{title: 'mid', published: '2025-03-15'},
			]
			expect(sortByPublishedDesc(nodes).map((n) => n.title)).toEqual([
				'new',
				'mid',
				'old',
			])
		})

		it('sorts nodes with missing or invalid published dates last', () => {
			const nodes = [
				{title: 'missing'},
				{title: 'dated', published: '2025-01-01'},
				{title: 'garbage', published: 'not-a-date'},
			]
			expect(sortByPublishedDesc(nodes)[0].title).toBe('dated')
		})

		it('does not treat a valid pre-1970 date as missing', () => {
			const nodes = [
				{title: 'undated', _sys: {filename: 'z'}},
				{title: 'epoch', published: '1969-01-01', _sys: {filename: 'a'}},
			]
			// The real (pre-epoch) date must outrank the genuinely-undated node.
			expect(sortByPublishedDesc(nodes)[0].title).toBe('epoch')
		})

		it('breaks ties by filename for deterministic order', () => {
			const nodes = [
				{title: 'b', published: '2025-01-01', _sys: {filename: 'b-post'}},
				{title: 'a', published: '2025-01-01', _sys: {filename: 'a-post'}},
			]
			expect(sortByPublishedDesc(nodes).map((n) => n.title)).toEqual(['a', 'b'])
		})

		it('does not mutate the input array', () => {
			const nodes = [
				{title: 'a', published: '2024-01-01'},
				{title: 'b', published: '2026-01-01'},
			]
			sortByPublishedDesc(nodes)
			expect(nodes.map((n) => n.title)).toEqual(['a', 'b'])
		})
	})

	describe('filterByPublishedWindow', () => {
		const nodes = [
			{title: 'before', published: '2026-06-01'},
			{title: 'inside', published: '2026-06-10'},
			{title: 'after', published: '2026-06-20'},
			{title: 'undated'},
		]

		it('keeps only nodes strictly inside the open window', () => {
			const result = filterByPublishedWindow(nodes, {
				after: '2026-06-05',
				before: '2026-06-15',
			})
			expect(result.map((n) => n.title)).toEqual(['inside'])
		})

		it('treats both bounds as exclusive, matching Tina', () => {
			// 'inside' sits exactly on both bounds and must be excluded from each.
			expect(
				filterByPublishedWindow(nodes, {after: '2026-06-10'}).map(
					(n) => n.title
				)
			).toEqual(['after'])
			expect(
				filterByPublishedWindow(nodes, {before: '2026-06-10'}).map(
					(n) => n.title
				)
			).toEqual(['before'])
		})

		it('drops nodes with missing published dates', () => {
			const result = filterByPublishedWindow(nodes, {})
			expect(result.map((n) => n.title)).not.toContain('undated')
		})
	})

	describe('filterByCategoryTitle', () => {
		const cat = (title) => ({categories: [{category: {title}}]})

		it('keeps nodes referencing the given category title', () => {
			const nodes = [
				{title: 'a', ...cat('Event')},
				{title: 'b', ...cat('Specialty Show')},
				{title: 'c', ...cat('Event')},
			]
			expect(filterByCategoryTitle(nodes, 'Event').map((n) => n.title)).toEqual(
				['a', 'c']
			)
		})

		it('tolerates nodes with no categories array', () => {
			const nodes = [{title: 'a'}, {title: 'b', ...cat('Event')}]
			expect(filterByCategoryTitle(nodes, 'Event').map((n) => n.title)).toEqual(
				['b']
			)
		})
	})

	describe('fetchCollectionNodes', () => {
		const fields = 'id title cover published _sys { filename }'

		it('returns nodes from the unsorted walk on the happy path', async () => {
			const queries = {blog: vi.fn()}
			const client = mockClient(
				'blogConnection',
				[
					[
						'title',
						page([
							{node: {title: 'a', published: '2025-01-01'}},
							{node: {title: 'b', published: '2026-01-01'}},
						]),
					],
				],
				queries
			)

			const nodes = await fetchCollectionNodes({
				client,
				collection: 'blog',
				fields,
				label: 'blog',
			})

			expect(nodes.map((n) => n.title)).toEqual(['a', 'b'])
			// Happy path must never touch the per-document fallback.
			expect(queries.blog).not.toHaveBeenCalled()
		})

		it('falls back to per-document fetch when the full walk fails', async () => {
			const queries = {
				blog: vi.fn((args) =>
					args.relativePath === 'bad.md'
						? Promise.reject(new Error('still broken'))
						: Promise.resolve({
								data: {blog: {title: args.relativePath, _sys: args}},
							})
				),
			}
			const client = mockClient(
				'blogConnection',
				[
					// The full-field walk (selecting `title`) fails like a broken index...
					[
						'title',
						new Error('Error querying file bad.md from collection blog'),
					],
					// ...but the filename-only walk still resolves.
					['_sys { filename }', page([node('good'), node('bad')])],
				],
				queries
			)

			const nodes = await fetchCollectionNodes({
				client,
				collection: 'blog',
				fields,
				label: 'blog',
			})

			// The good document survives; the broken one is skipped, not fatal.
			expect(nodes.map((n) => n.title)).toEqual(['good.md'])
			expect(queries.blog).toHaveBeenCalledTimes(2)
		})

		it('skips fallback edges that have no filename without calling fetch', async () => {
			const queries = {
				blog: vi.fn((args) =>
					Promise.resolve({data: {blog: {title: args.relativePath}}})
				),
			}
			const client = mockClient(
				'blogConnection',
				[
					['title', new Error('broken index')],
					['_sys { filename }', page([{node: {_sys: {}}}, node('ok')])],
				],
				queries
			)

			const nodes = await fetchCollectionNodes({
				client,
				collection: 'blog',
				fields,
				label: 'blog',
			})

			expect(nodes.map((n) => n.title)).toEqual(['ok.md'])
			// The filename-less edge must not trigger a `client.queries.blog(undefined)` call.
			expect(queries.blog).toHaveBeenCalledTimes(1)
		})

		it('returns an empty list without crashing when the connection resolves to null', async () => {
			// A broken index can return `{data: {blogConnection: null}}` (a resolved
			// 200, not a rejection); this must not throw and break the build.
			const queries = {blog: vi.fn()}
			const client = mockClient(
				'blogConnection',
				[['blogConnection', null]],
				queries
			)

			const nodes = await fetchCollectionNodes({
				client,
				collection: 'blog',
				fields,
				label: 'blog',
			})

			expect(nodes).toEqual([])
			expect(queries.blog).not.toHaveBeenCalled()
		})

		it('recovers via the filename walk when only the full-field walk returns null', async () => {
			// A null on the full-field walk must be treated as a failure and fall
			// back to the (here-succeeding) filename walk, not silently truncate.
			const queries = {
				blog: vi.fn((args) =>
					Promise.resolve({data: {blog: {title: args.relativePath}}})
				),
			}
			const client = mockClient(
				'blogConnection',
				[
					// Full-field walk (contains `title`) returns a null connection...
					['title', null],
					// ...but the filename-only walk resolves with real edges.
					['_sys { filename }', page([node('a'), node('b')])],
				],
				queries
			)

			const nodes = await fetchCollectionNodes({
				client,
				collection: 'blog',
				fields,
				label: 'blog',
			})

			expect(nodes.map((n) => n.title)).toEqual(['a.md', 'b.md'])
			expect(queries.blog).toHaveBeenCalledTimes(2)
		})
	})
})
