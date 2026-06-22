import {describe, it, expect, vi, beforeEach} from 'vitest'
import {
	fetchCollectionNodes,
	sortByPublishedDesc,
	filterByPublishedWindow,
} from '../lib/resilientPosts'

// Build a `request` mock that returns one connection page. `byQuery` maps a
// substring of the GraphQL query to the connection payload it should resolve
// (or an Error to reject with), letting a test make the full-field walk fail
// while the filename-only walk succeeds.
function mockRequest(connection, byQuery) {
	return vi.fn(({query}) => {
		for (const [needle, payload] of byQuery) {
			if (query.includes(needle)) {
				if (payload instanceof Error) return Promise.reject(payload)
				return Promise.resolve({data: {[connection]: payload}})
			}
		}
		throw new Error(`unexpected query: ${query}`)
	})
}

const page = (edges) => ({
	edges,
	pageInfo: {hasNextPage: false, endCursor: null},
})

describe('resilientPosts', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.spyOn(console, 'warn').mockImplementation(() => {})
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

		it('keeps only nodes inside the half-open window', () => {
			const result = filterByPublishedWindow(nodes, {
				after: '2026-06-05',
				before: '2026-06-15',
			})
			expect(result.map((n) => n.title)).toEqual(['inside'])
		})

		it('treats the upper bound as exclusive', () => {
			const result = filterByPublishedWindow(nodes, {
				before: '2026-06-10',
			})
			expect(result.map((n) => n.title)).toEqual(['before'])
		})

		it('drops nodes with missing published dates', () => {
			const result = filterByPublishedWindow(nodes, {})
			expect(result.map((n) => n.title)).not.toContain('undated')
		})
	})

	describe('fetchCollectionNodes', () => {
		const fields = 'id title cover published _sys { filename }'

		it('returns nodes from the unsorted walk on the happy path', async () => {
			const request = mockRequest('blogConnection', [
				[
					'title',
					page([
						{node: {title: 'a', published: '2025-01-01'}},
						{node: {title: 'b', published: '2026-01-01'}},
					]),
				],
			])
			const fetchOne = vi.fn()

			const nodes = await fetchCollectionNodes({
				connection: 'blogConnection',
				fields,
				request,
				fetchOne,
				label: 'blog',
			})

			expect(nodes.map((n) => n.title)).toEqual(['a', 'b'])
			// Happy path must never touch the per-document fallback.
			expect(fetchOne).not.toHaveBeenCalled()
		})

		it('falls back to per-document fetch when the full walk fails', async () => {
			const request = mockRequest('blogConnection', [
				// The full-field walk (selecting `title`) fails like a broken index...
				['title', new Error('Error querying file bad.md from collection blog')],
				// ...but the filename-only walk still resolves.
				[
					'_sys { filename }',
					page([
						{node: {_sys: {filename: 'good'}}},
						{node: {_sys: {filename: 'bad'}}},
					]),
				],
			])
			const fetchOne = vi.fn((filename) =>
				filename === 'bad'
					? Promise.reject(new Error('still broken'))
					: Promise.resolve({title: filename, _sys: {filename}})
			)

			const nodes = await fetchCollectionNodes({
				connection: 'blogConnection',
				fields,
				request,
				fetchOne,
				label: 'blog',
			})

			// The good document survives; the broken one is skipped, not fatal.
			expect(nodes.map((n) => n.title)).toEqual(['good'])
			expect(fetchOne).toHaveBeenCalledTimes(2)
		})
	})
})
