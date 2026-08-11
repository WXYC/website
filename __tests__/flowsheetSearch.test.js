import {describe, it, expect} from 'vitest'
import {
	DEFAULT_PAGE_SIZE,
	MAX_REACHABLE_PAGE,
	canGoToNextPage,
	fetchFlowsheetSearch,
	formatPlayDate,
	formatSearchTotal,
	hasEmptyFieldFilter,
	isAtDepthLimit,
	normalizePgTimestamp,
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

	it('never sends a cursor param — this client is offset-paging only', async () => {
		const fetchImpl = createMockFetch({
			results: [],
			total: 0,
			page: 0,
			totalPages: 0,
		})
		await fetchFlowsheetSearch({q: 'stereolab', page: 3}, {fetchImpl})

		const url = new URL(fetchImpl.mock.calls[0][0])
		expect(url.searchParams.has('cursor')).toBe(false)
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

	it('surfaces the status on any non-OK response, including 400 — the controller only 400s on inputs this client cannot send', async () => {
		const fetchImpl = createMockFetch(null, {ok: false, status: 400})

		await expect(fetchFlowsheetSearch({}, {fetchImpl})).rejects.toThrow(
			/\(400\)/
		)
	})

	it('surfaces the status on any other failure', async () => {
		const fetchImpl = createMockFetch(null, {ok: false, status: 503})

		await expect(fetchFlowsheetSearch({}, {fetchImpl})).rejects.toThrow(
			/\(503\)/
		)
	})

	it('collapses a non-JSON 200 body into a human error rather than the raw parse failure', async () => {
		const fetchImpl = () =>
			Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
			})

		await expect(fetchFlowsheetSearch({}, {fetchImpl})).rejects.toThrow(
			/could not search airplay records/i
		)
	})
})

describe('formatSearchTotal', () => {
	it('formats a total at or under the count cap with thousands separators', () => {
		expect(formatSearchTotal(823)).toBe('823')
		expect(formatSearchTotal(8234)).toBe('8,234')
		expect(formatSearchTotal(10000)).toBe('10,000')
	})

	it('renders the capped sentinel as an open-ended range rather than a fake exact count', () => {
		// The backend's COUNT_CAP + 1 sentinel — verified live against
		// `?q=the&limit=25` and the empty-query landing view, both of which
		// come back as exactly 10001 against the ~2.6M-row table.
		expect(formatSearchTotal(10001)).toBe('10,000+')
	})
})

describe('pagination depth clamp', () => {
	describe('canGoToNextPage', () => {
		it('allows paging forward under both the clamp and the reported totalPages', () => {
			expect(canGoToNextPage({page: 5}, 50)).toBe(true)
		})

		it('refuses to page past the reachable-depth clamp even when totalPages claims more', () => {
			expect(canGoToNextPage({page: MAX_REACHABLE_PAGE}, 401)).toBe(false)
		})

		it('refuses at the true last page regardless of the clamp', () => {
			expect(canGoToNextPage({page: 4}, 5)).toBe(false)
		})
	})

	describe('isAtDepthLimit', () => {
		it('is false while under the clamp', () => {
			expect(isAtDepthLimit({page: 5}, 401)).toBe(false)
		})

		it('is true once the clamp is hit and the backend claims more pages exist', () => {
			expect(isAtDepthLimit({page: MAX_REACHABLE_PAGE}, 401)).toBe(true)
		})

		it('is false at the clamp if the real result set ends there too', () => {
			expect(
				isAtDepthLimit({page: MAX_REACHABLE_PAGE}, MAX_REACHABLE_PAGE + 1)
			).toBe(false)
		})
	})
})

describe('hasEmptyFieldFilter', () => {
	it('flags a recognized field prefix with nothing after the colon', () => {
		expect(hasEmptyFieldFilter('artist:')).toBe(true)
		expect(hasEmptyFieldFilter('album:')).toBe(true)
	})

	it('flags a bare prefix immediately followed by a boolean keyword', () => {
		expect(hasEmptyFieldFilter('artist: AND label:domino')).toBe(true)
	})

	it('matches the longer dateRange prefix rather than misreading it as date', () => {
		expect(hasEmptyFieldFilter('dateRange:')).toBe(true)
	})

	it('does not flag a fully-qualified field filter', () => {
		expect(hasEmptyFieldFilter('artist:foo AND album:"bar"')).toBe(false)
	})

	it('does not flag a literal colon that is not a recognized prefix', () => {
		// Verified live: `Emperor: Lift Your Skinny Fists` returns 31 results —
		// the colon is read literally, not as field syntax.
		expect(hasEmptyFieldFilter('Emperor: Lift Your Skinny Fists')).toBe(false)
	})

	it('does not flag a query with no colon at all', () => {
		expect(hasEmptyFieldFilter('juana molina')).toBe(false)
	})

	it('does not flag an empty query', () => {
		expect(hasEmptyFieldFilter('')).toBe(false)
	})
})

describe('normalizePgTimestamp', () => {
	it('normalizes the exact production shape into a strict ECMA-262 Date Time String', () => {
		expect(normalizePgTimestamp('2026-07-21 15:47:47.654+00')).toBe(
			'2026-07-21T15:47:47.654+00:00'
		)
	})

	it('normalizes a bare-seconds timestamp with no milliseconds', () => {
		expect(normalizePgTimestamp('2026-01-02 02:15:00+00')).toBe(
			'2026-01-02T02:15:00+00:00'
		)
	})

	it('leaves an already-strict ISO instant unchanged in effect', () => {
		expect(normalizePgTimestamp('2026-08-03T14:00:00.000Z')).toBe(
			'2026-08-03T14:00:00.000Z'
		)
	})

	it('passes an unrecognized shape through unchanged', () => {
		expect(normalizePgTimestamp('not-a-date')).toBe('not-a-date')
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
