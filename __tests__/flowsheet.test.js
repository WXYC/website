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
	FlowsheetFetchError,
	PAGE_LIMIT,
	fetchRecentFlowsheet,
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
