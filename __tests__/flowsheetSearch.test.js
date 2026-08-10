import {describe, it, expect} from 'vitest'
import {
	DEFAULT_PAGE_SIZE,
	fetchFlowsheetSearch,
	formatPlayDate,
} from '../lib/flowsheetSearch'
import {createMockFetch, testData} from './test-utils'

const result = testData.flowsheetSearchResult

describe('fetchFlowsheetSearch', () => {
	it('requests page and limit as plain integers', async () => {
		const fetchImpl = createMockFetch({
			results: [],
			total: 0,
			page: 0,
			totalPages: 0,
		})
		await fetchFlowsheetSearch({page: 2, limit: 10}, {fetchImpl})

		const url = new URL(fetchImpl.mock.calls[0][0])
		expect(url.pathname).toBe('/flowsheet/search')
		expect(url.searchParams.get('page')).toBe('2')
		expect(url.searchParams.get('limit')).toBe('10')
	})

	it('defaults to page 0 and the standard page size', async () => {
		const fetchImpl = createMockFetch({
			results: [],
			total: 0,
			page: 0,
			totalPages: 0,
		})
		await fetchFlowsheetSearch({}, {fetchImpl})

		const url = new URL(fetchImpl.mock.calls[0][0])
		expect(url.searchParams.get('page')).toBe('0')
		expect(url.searchParams.get('limit')).toBe(String(DEFAULT_PAGE_SIZE))
	})

	it('sends a trimmed q param when a query is given', async () => {
		const fetchImpl = createMockFetch({
			results: [],
			total: 0,
			page: 0,
			totalPages: 0,
		})
		await fetchFlowsheetSearch({q: '  juana molina  '}, {fetchImpl})

		const url = new URL(fetchImpl.mock.calls[0][0])
		expect(url.searchParams.get('q')).toBe('juana molina')
	})

	it('omits q entirely for an empty or whitespace-only query, so the backend serves its recent-tracks default', async () => {
		const fetchImpl = createMockFetch({
			results: [],
			total: 0,
			page: 0,
			totalPages: 0,
		})
		await fetchFlowsheetSearch({q: '   '}, {fetchImpl})

		const url = new URL(fetchImpl.mock.calls[0][0])
		expect(url.searchParams.has('q')).toBe(false)
	})

	it('sends no credentials', async () => {
		const fetchImpl = createMockFetch({
			results: [],
			total: 0,
			page: 0,
			totalPages: 0,
		})
		await fetchFlowsheetSearch({}, {fetchImpl})

		expect(fetchImpl.mock.calls[0][1].credentials).toBe('omit')
	})

	it('resolves with the response envelope on success', async () => {
		const envelope = {
			results: [result()],
			total: 823,
			page: 0,
			totalPages: 275,
		}
		const fetchImpl = createMockFetch(envelope)

		await expect(fetchFlowsheetSearch({}, {fetchImpl})).resolves.toEqual(
			envelope
		)
	})

	it('translates a 400 into guidance about the query rather than the raw status', async () => {
		const fetchImpl = createMockFetch(null, {ok: false, status: 400})

		await expect(
			fetchFlowsheetSearch({q: 'artist:'}, {fetchImpl})
		).rejects.toThrow(/query/i)
	})

	it('surfaces the status on any other failure', async () => {
		const fetchImpl = createMockFetch(null, {ok: false, status: 503})

		await expect(fetchFlowsheetSearch({}, {fetchImpl})).rejects.toThrow(
			/\(503\)/
		)
	})
})

describe('formatPlayDate', () => {
	it('renders a Postgres timestamptz string as a readable Eastern date and time', () => {
		// 15:47:47 UTC on 2026-07-21 is Eastern Daylight Time (UTC-4): 11:47 AM.
		expect(formatPlayDate('2026-07-21 15:47:47.654+00')).toBe(
			'July 21, 2026, 11:47 AM'
		)
	})

	it('accounts for the Eastern/UTC day boundary', () => {
		// 02:15 UTC on 2026-01-02 is 9:15 PM Eastern Standard Time the day before.
		expect(formatPlayDate('2026-01-02 02:15:00+00')).toBe(
			'January 1, 2026, 9:15 PM'
		)
	})

	it('returns an empty string for an unparsable timestamp', () => {
		expect(formatPlayDate('not-a-date')).toBe('')
	})

	it('returns an empty string for a missing timestamp', () => {
		expect(formatPlayDate(null)).toBe('')
		expect(formatPlayDate(undefined)).toBe('')
	})
})
