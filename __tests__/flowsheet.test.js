/**
 * Direct tests for the `GET /flowsheet` client.
 *
 * Its behaviour was previously reachable only through `pages/playlist.jsx`,
 * which meant the request shape — the page size, the omitted credentials, the
 * curated-versus-raw error distinction — could only be asserted by rendering a
 * React tree around it. Now that it sits in `lib/` alongside the range and
 * search clients, it is tested the way they are.
 */
import {describe, it, expect} from 'vitest'
import {
	EmptySetError,
	FlowsheetFetchError,
	PAGE_LIMIT,
	describeSet,
	fetchRecentFlowsheet,
	fetchSet,
} from '../lib/flowsheet'
import {createMockFetch, testData} from './test-utils'

const envelope = testData.flowsheetEnvelope

describe('fetchRecentFlowsheet', () => {
	it('asks for the first page at the standard window size', async () => {
		const fetchImpl = createMockFetch(envelope([]))
		await fetchRecentFlowsheet({fetchImpl})

		const url = new URL(fetchImpl.mock.calls[0][0])
		expect(url.pathname).toBe('/flowsheet')
		expect(url.searchParams.get('page')).toBe('0')
		expect(url.searchParams.get('limit')).toBe(String(PAGE_LIMIT))
	})

	it('sends no credentials', async () => {
		// A public read on a public site. Sending cookies would be pointless
		// and would defeat the wildcard-free CORS allowlist Backend exposes to
		// wxyc.org.
		const fetchImpl = createMockFetch(envelope([]))
		await fetchRecentFlowsheet({fetchImpl})

		expect(fetchImpl.mock.calls[0][1].credentials).toBe('omit')
	})

	it('forwards an abort signal', async () => {
		const controller = new AbortController()
		const fetchImpl = createMockFetch(envelope([]))
		await fetchRecentFlowsheet({fetchImpl, signal: controller.signal})

		expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal)
	})

	it('returns the envelope as the endpoint sent it', async () => {
		const body = envelope([testData.flowsheetTrack()], {
			on_air: {dj_name: 'DJ OVNI'},
		})
		const fetchImpl = createMockFetch(body)

		await expect(fetchRecentFlowsheet({fetchImpl})).resolves.toEqual(body)
	})

	it('rejects a non-OK response with copy that is safe to show a listener', async () => {
		const fetchImpl = createMockFetch(null, {ok: false, status: 503})

		// The type is the contract, not just the text: the page renders a
		// `FlowsheetFetchError`'s message verbatim and collapses every other
		// rejection to a generic line, because a browser-authored message
		// ("Failed to fetch", "Unexpected token '<'") is not public copy.
		await expect(fetchRecentFlowsheet({fetchImpl})).rejects.toBeInstanceOf(
			FlowsheetFetchError
		)
		await expect(fetchRecentFlowsheet({fetchImpl})).rejects.toThrow('503')
	})
})

describe('fetchSet', () => {
	it('asks the endpoint for one show at the requested depth', async () => {
		// `shows_limit` is what makes this set pagination rather than row
		// pagination: Backend routes it to `getNShows(n, page)`, which is
		// `ORDER BY shows.id DESC OFFSET page * n LIMIT n`. So page 1 is the
		// show before the current one, whatever length either happens to be.
		const fetchImpl = createMockFetch([])
		await fetchSet(1, {fetchImpl})

		const url = new URL(fetchImpl.mock.calls[0][0])
		expect(url.pathname).toBe('/flowsheet')
		expect(url.searchParams.get('shows_limit')).toBe('1')
		expect(url.searchParams.get('page')).toBe('1')
	})

	it('sends no credentials', async () => {
		const fetchImpl = createMockFetch([])
		await fetchSet(1, {fetchImpl})

		expect(fetchImpl.mock.calls[0][1].credentials).toBe('omit')
	})

	it('returns the bare array this branch responds with, not an envelope', async () => {
		// Unlike the default branch, the `shows_limit` branch responds with
		// `projectEntriesV2(entries)` directly — no `total`, no `page`, no
		// `on_air`. A client written against the envelope would read
		// `undefined` for every one of them.
		const rows = [testData.flowsheetTrack()]
		const fetchImpl = createMockFetch(rows)

		await expect(fetchSet(1, {fetchImpl})).resolves.toEqual(rows)
	})

	it('distinguishes an empty set from a failure', async () => {
		// Backend answers the `shows_limit` branch with 404 "No Tracks found"
		// when the selected show has no rows. That covers two situations —
		// paging past the oldest show, and a show that was opened and closed
		// with nothing logged — and neither is an outage. Collapsing it into
		// the generic error would put a red banner in front of a listener for
		// a set that is merely empty.
		const fetchImpl = createMockFetch(
			{message: 'No Tracks found'},
			{ok: false, status: 404}
		)

		await expect(fetchSet(9999, {fetchImpl})).rejects.toBeInstanceOf(
			EmptySetError
		)
	})

	it('treats every other bad status as a failure', async () => {
		const fetchImpl = createMockFetch(null, {ok: false, status: 503})

		const rejection = fetchSet(1, {fetchImpl})
		await expect(rejection).rejects.toBeInstanceOf(FlowsheetFetchError)
		await expect(fetchSet(1, {fetchImpl})).rejects.toThrow('503')
	})

	it('rejects a 200 that is not an array rather than rendering nothing', async () => {
		const fetchImpl = createMockFetch({entries: []})

		await expect(fetchSet(1, {fetchImpl})).rejects.toBeInstanceOf(
			FlowsheetFetchError
		)
	})
})

describe('describeSet', () => {
	const signOn = {
		id: 2,
		entry_type: 'show_start',
		dj_name: 'DJ Decent',
		add_time: '2026-08-10T22:39:10.563Z',
		play_order: 1,
	}
	const signOff = {
		id: 9,
		entry_type: 'show_end',
		dj_name: 'DJ Decent',
		add_time: '2026-08-11T01:01:20.191Z',
		play_order: 9,
	}

	it('reads the DJ and the air times off the set’s own delimiter rows', () => {
		// This endpoint branch returns no `shows` metadata at all, so the
		// header has to come from the entries. The two delimiters are the
		// second independent signal api.yaml points at for exactly this.
		expect(describeSet([signOff, signOn])).toEqual({
			djName: 'DJ Decent',
			startTime: '2026-08-10T22:39:10.563Z',
			endTime: '2026-08-11T01:01:20.191Z',
		})
	})

	it('leaves the end open when the set has no sign-off', () => {
		// Either the show is on the air, or its `show_end` was never
		// delivered. Those are not distinguishable from here, so neither is
		// claimed.
		expect(describeSet([signOn])).toEqual({
			djName: 'DJ Decent',
			startTime: '2026-08-10T22:39:10.563Z',
			endTime: null,
		})
	})

	const djJoin = {
		id: 5,
		entry_type: 'dj_join',
		dj_name: 'DJ Guest',
		add_time: '2026-08-10T23:00:00.000Z',
		play_order: 5,
	}

	it('reads the DJ off the sign-off when the sign-on is missing', () => {
		// A set can arrive without a `show_start` — a dropped delivery, or a
		// window that opens mid-show.
		expect(describeSet([signOff, djJoin])).toEqual({
			djName: 'DJ Decent',
			startTime: null,
			endTime: '2026-08-11T01:01:20.191Z',
		})
	})

	it('prefers a delimiter over a guest arrival, which names the wrong person', () => {
		// `dj_join` names the DJ who arrived partway through someone else's
		// set. Reading it first would caption DJ Decent's show with DJ Guest.
		expect(describeSet([signOff, djJoin, signOn]).djName).toBe('DJ Decent')
	})

	it('falls back to a guest arrival only when neither delimiter survives', () => {
		// Track rows carry no `dj_name` on the V2 wire, so the last resort has
		// to be a marker row, not just "any entry".
		expect(describeSet([djJoin, testData.flowsheetTrack()])).toEqual({
			djName: 'DJ Guest',
			startTime: null,
			endTime: null,
		})
	})

	it('names nobody rather than guessing when nothing carries a handle', () => {
		expect(describeSet([testData.flowsheetTrack()])).toEqual({
			djName: null,
			startTime: null,
			endTime: null,
		})
	})

	it('survives an empty set', () => {
		expect(describeSet([])).toEqual({
			djName: null,
			startTime: null,
			endTime: null,
		})
	})
})
