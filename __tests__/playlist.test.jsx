import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, act, fireEvent} from '@testing-library/react'
import {createMockFetch, createTestLifecycle, testData} from './test-utils'

vi.mock('next/head', () => ({
	default: ({children}) => <>{children}</>,
}))

const {default: LivePlaylist, REFRESH_INTERVAL_MS} = await import(
	'../pages/playlist'
)

const track = testData.flowsheetTrack
const envelope = testData.flowsheetEnvelope

function mockFetchOnce(body, options) {
	global.fetch = createMockFetch(body, options)
	return global.fetch
}

/** Flushes the microtask queue so a resolved fetch's `.then` chain settles. */
async function flushPromises() {
	await act(async () => {
		await Promise.resolve()
		await Promise.resolve()
	})
}

/** Advances fake timers by one refresh interval and lets pending work settle. */
async function advanceOneInterval() {
	await act(async () => {
		vi.advanceTimersByTime(REFRESH_INTERVAL_MS)
		await Promise.resolve()
		await Promise.resolve()
	})
}

const lifecycle = createTestLifecycle()

beforeEach(lifecycle.beforeEach)
afterEach(() => {
	lifecycle.afterEach()
	vi.useRealTimers()
})

describe('Live playlist page', () => {
	it('shows a loading state before the fetch resolves', () => {
		global.fetch = vi.fn(() => new Promise(() => {}))
		render(<LivePlaylist />)

		expect(screen.getByRole('status')).toHaveProperty(
			'textContent',
			expect.stringContaining('Loading')
		)
	})

	it('renders the recent flowsheet with artist, track, release and label', async () => {
		mockFetchOnce(envelope([track()]))
		render(<LivePlaylist />)
		await flushPromises()

		expect(screen.getByText('Juana Molina')).toBeDefined()
		expect(screen.getByText('la paradoja')).toBeDefined()
		expect(screen.getByText('DOGA')).toBeDefined()
		expect(screen.getByText('Sonamos')).toBeDefined()
	})

	it('marks a requested track', async () => {
		mockFetchOnce(envelope([track({request_flag: true})]))
		render(<LivePlaylist />)
		await flushPromises()

		expect(screen.getByText('(request)')).toBeDefined()
	})

	it('renders a fetch failure as an alert rather than a blank page', async () => {
		mockFetchOnce(null, {ok: false, status: 503})
		render(<LivePlaylist />)
		await flushPromises()

		const alert = await screen.findByRole('alert')
		expect(alert.textContent).toContain('503')
	})

	it('renders an empty response without erroring', async () => {
		mockFetchOnce(envelope([]))
		render(<LivePlaylist />)
		await flushPromises()

		expect(screen.getByText(/nothing.*aired/i)).toBeDefined()
	})

	it('renders a non-track entry type without an undefined cell or a key warning', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

		mockFetchOnce(
			envelope([
				track({id: 200, play_order: 2}),
				{
					id: 199,
					show_id: 1,
					play_order: 1,
					add_time: '2026-08-10T22:57:31.357Z',
					entry_type: 'talkset',
					message: 'TALKSET',
				},
			])
		)
		render(<LivePlaylist />)
		await flushPromises()

		expect(screen.getByText('TALKSET')).toBeDefined()
		expect(screen.queryByText('undefined')).toBeNull()
		const keyWarning = consoleError.mock.calls.some((call) =>
			call.some((arg) => typeof arg === 'string' && arg.includes('key'))
		)
		expect(keyWarning).toBe(false)

		consoleError.mockRestore()
	})

	it('handles every non-track entry type the backend can send', async () => {
		mockFetchOnce(
			envelope([
				track({id: 210, play_order: 6}),
				{
					id: 209,
					show_id: 1,
					play_order: 5,
					add_time: '2026-08-10T23:01:20.191Z',
					entry_type: 'show_end',
					dj_name: 'DJ Decent',
					timestamp: '8/10/2026, 7:01:20 PM',
				},
				{
					id: 208,
					show_id: 1,
					play_order: 4,
					add_time: '2026-08-10T23:01:17.402Z',
					entry_type: 'breakpoint',
					message: '--- 7:00 PM BREAKPOINT ---',
					radio_hour: '2026-08-10T23:00:00.000Z',
				},
				{
					id: 207,
					show_id: 1,
					play_order: 3,
					add_time: '2026-08-10T22:57:31.357Z',
					entry_type: 'talkset',
					message: 'TALKSET',
				},
				{
					id: 206,
					show_id: 1,
					play_order: 2,
					add_time: '2026-08-10T22:39:10.563Z',
					entry_type: 'show_start',
					dj_name: 'DJ Decent',
					timestamp: '8/10/2026, 6:39:10 PM',
				},
				{
					id: 205,
					show_id: 1,
					play_order: 1,
					add_time: '2026-08-10T22:35:00.000Z',
					entry_type: 'dj_join',
					dj_name: 'DJ Guest',
				},
			])
		)
		render(<LivePlaylist />)
		await flushPromises()

		expect(screen.getByText('TALKSET')).toBeDefined()
		expect(screen.getByText('--- 7:00 PM BREAKPOINT ---')).toBeDefined()
		expect(screen.getByText(/DJ Guest joined/)).toBeDefined()
	})

	it('shows who is currently on the air', async () => {
		mockFetchOnce(envelope([track()], {on_air: {dj_name: 'DJ OVNI'}}))
		render(<LivePlaylist />)
		await flushPromises()

		expect(screen.getByText(/DJ OVNI/)).toBeDefined()
	})

	it('sends no credentials', async () => {
		const fetchMock = mockFetchOnce(envelope([]))
		render(<LivePlaylist />)
		await flushPromises()

		expect(fetchMock.mock.calls[0][1].credentials).toBe('omit')
	})

	it('requests the live flowsheet endpoint', async () => {
		const fetchMock = mockFetchOnce(envelope([]))
		render(<LivePlaylist />)
		await flushPromises()

		const url = new URL(fetchMock.mock.calls[0][0])
		expect(url.pathname).toBe('/flowsheet')
		expect(url.searchParams.get('page')).toBe('0')
		expect(url.searchParams.get('limit')).toBe('50')
	})

	it('auto-refreshes on an interval while the tab is open', async () => {
		vi.useFakeTimers()
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => envelope([track()]),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () =>
					envelope([
						track({
							id: 999,
							artist_name: 'Chuquimamani-Condori',
							track_title: 'Call Your Name',
							album_title: 'Edits',
							record_label: 'self-released',
						}),
					]),
			})
		global.fetch = fetchMock

		render(<LivePlaylist />)
		await flushPromises()
		expect(screen.getByText('Juana Molina')).toBeDefined()

		await advanceOneInterval()

		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(screen.getByText('Chuquimamani-Condori')).toBeDefined()
	})

	it('clears the refresh interval on unmount', async () => {
		vi.useFakeTimers()
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => envelope([]),
		})
		global.fetch = fetchMock

		const {unmount} = render(<LivePlaylist />)
		await flushPromises()
		expect(fetchMock).toHaveBeenCalledTimes(1)

		unmount()

		await act(async () => {
			vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3)
			await Promise.resolve()
		})

		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	describe('air-order sorting', () => {
		it('renders entries by the DJ-stated play_order, not by the order the endpoint returned them in', async () => {
			// Simulates a retroactive insert: the endpoint's own order (insertion
			// order, i.e. desc(id)) is neither already correct nor its exact
			// reverse, so this catches both "no sort" and "sort, then reverse"
			// implementations, not just one of them.
			mockFetchOnce(
				envelope([
					track({
						id: 500,
						show_id: 42,
						play_order: 2,
						artist_name: 'Artist B',
					}),
					track({
						id: 499,
						show_id: 42,
						play_order: 4,
						artist_name: 'Artist D',
					}),
					track({
						id: 498,
						show_id: 42,
						play_order: 1,
						artist_name: 'Artist A',
					}),
					track({
						id: 497,
						show_id: 42,
						play_order: 3,
						artist_name: 'Artist C',
					}),
				])
			)
			const {container} = render(<LivePlaylist />)
			await flushPromises()

			const text = container.textContent
			const positions = ['Artist D', 'Artist C', 'Artist B', 'Artist A'].map(
				(name) => text.indexOf(name)
			)
			expect(positions.every((position) => position !== -1)).toBe(true)
			expect(positions).toEqual([...positions].sort((a, b) => a - b))
		})

		it('breaks a play_order collision on id, newest first, rather than falling back to arrival order', async () => {
			// Two rows can legitimately share one play_order — the tubafrenzy
			// webhook and the dj-site live-insert path assign it independently
			// with no per-show UNIQUE constraint. Fetch/array order here is
			// deliberately the opposite of the expected id-desc tie-break, so a
			// comparator that dropped the id tie-break (falling back to
			// `Array.prototype.sort`'s stability, i.e. arrival order) would
			// render this the wrong way round.
			mockFetchOnce(
				envelope([
					track({
						id: 601,
						show_id: 7,
						play_order: 5,
						artist_name: 'Older Tie',
					}),
					track({
						id: 602,
						show_id: 7,
						play_order: 5,
						artist_name: 'Newer Tie',
					}),
				])
			)
			const {container} = render(<LivePlaylist />)
			await flushPromises()

			const text = container.textContent
			expect(text.indexOf('Newer Tie')).toBeLessThan(text.indexOf('Older Tie'))
		})

		it('renders an entry whose show_id is null without crashing or producing NaN', async () => {
			mockFetchOnce(
				envelope([
					track({id: 900, show_id: null, artist_name: 'Unattributed Artist'}),
				])
			)
			const {container} = render(<LivePlaylist />)
			await flushPromises()

			expect(screen.getByText('Unattributed Artist')).toBeDefined()
			expect(container.textContent).not.toContain('NaN')
		})
	})

	describe('error message curation', () => {
		it('shows a generic message for a network failure, not the raw browser error', async () => {
			global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
			render(<LivePlaylist />)
			await flushPromises()

			const alert = await screen.findByRole('alert')
			expect(alert.textContent).toBe('Could not load the playlist.')
			expect(alert.textContent).not.toContain('Failed to fetch')
		})

		it('shows a generic message when the response body is not valid JSON', async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: vi
					.fn()
					.mockRejectedValue(new SyntaxError("Unexpected token '<'")),
			})
			render(<LivePlaylist />)
			await flushPromises()

			const alert = await screen.findByRole('alert')
			expect(alert.textContent).toBe('Could not load the playlist.')
			expect(alert.textContent).not.toContain('Unexpected token')
		})
	})

	describe('background poll failures', () => {
		it('keeps the last good playlist on screen when a background poll fails', async () => {
			vi.useFakeTimers()
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => envelope([track()]),
				})
				.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			global.fetch = fetchMock

			render(<LivePlaylist />)
			await flushPromises()
			expect(screen.getByText('Juana Molina')).toBeDefined()

			await advanceOneInterval()

			// The failed background poll must not have wiped the table: the
			// last successfully fetched playlist is still true, just stale.
			expect(screen.getByText('Juana Molina')).toBeDefined()
		})

		it('shows a staleness notice and a retry affordance once a background poll fails', async () => {
			vi.useFakeTimers()
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => envelope([track()]),
				})
				.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			global.fetch = fetchMock

			render(<LivePlaylist />)
			await flushPromises()

			await advanceOneInterval()

			expect(screen.getByText(/couldn.t refresh/i)).toBeDefined()
			expect(screen.getByRole('button', {name: /retry/i})).toBeDefined()
			expect(screen.getByText('Juana Molina')).toBeDefined()
		})

		it('re-fetches when the Retry button is clicked, clearing the staleness notice on success', async () => {
			vi.useFakeTimers()
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => envelope([track()]),
				})
				.mockRejectedValueOnce(new TypeError('Failed to fetch'))
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () =>
						envelope([track({id: 321, artist_name: 'Jessica Pratt'})]),
				})
			global.fetch = fetchMock

			render(<LivePlaylist />)
			await flushPromises()
			await advanceOneInterval()

			const retryButton = screen.getByRole('button', {name: /retry/i})
			await act(async () => {
				fireEvent.click(retryButton)
				await Promise.resolve()
				await Promise.resolve()
			})

			expect(fetchMock).toHaveBeenCalledTimes(3)
			expect(screen.getByText('Jessica Pratt')).toBeDefined()
			expect(screen.queryByRole('button', {name: /retry/i})).toBeNull()
		})
	})

	describe('overlapping polls', () => {
		it('does not let a slow, superseded poll response overwrite a fresher one', async () => {
			vi.useFakeTimers()
			let resolveSlowPoll
			const slowPollResponse = new Promise((resolve) => {
				resolveSlowPoll = resolve
			})

			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => envelope([track()]),
				})
				.mockReturnValueOnce(slowPollResponse)
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () =>
						envelope([track({id: 777, artist_name: 'Chuquimamani-Condori'})]),
				})
			global.fetch = fetchMock

			render(<LivePlaylist />)
			await flushPromises()
			expect(screen.getByText('Juana Molina')).toBeDefined()

			// First background poll fires and is left pending (the slow one).
			await advanceOneInterval()
			// Second background poll fires and resolves before the first does.
			await advanceOneInterval()

			expect(screen.getByText('Chuquimamani-Condori')).toBeDefined()

			// The slow, now-superseded poll finally resolves.
			await act(async () => {
				resolveSlowPoll({
					ok: true,
					status: 200,
					json: async () =>
						envelope([track({id: 555, artist_name: 'Jessica Pratt'})]),
				})
				await Promise.resolve()
				await Promise.resolve()
			})

			expect(screen.getByText('Chuquimamani-Condori')).toBeDefined()
			expect(screen.queryByText('Jessica Pratt')).toBeNull()
		})
	})

	describe('visibility gating', () => {
		const originalDescriptor = Object.getOwnPropertyDescriptor(
			Document.prototype,
			'visibilityState'
		)

		afterEach(() => {
			if (originalDescriptor) {
				Object.defineProperty(document, 'visibilityState', originalDescriptor)
			} else {
				delete document.visibilityState
			}
		})

		function setVisibility(state) {
			Object.defineProperty(document, 'visibilityState', {
				configurable: true,
				get: () => state,
			})
			document.dispatchEvent(new Event('visibilitychange'))
		}

		it('stops polling while the tab is hidden and refetches once when it becomes visible again', async () => {
			vi.useFakeTimers()
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => envelope([track()]),
			})
			global.fetch = fetchMock

			render(<LivePlaylist />)
			await flushPromises()
			expect(fetchMock).toHaveBeenCalledTimes(1)

			await act(async () => {
				setVisibility('hidden')
				await Promise.resolve()
			})

			await act(async () => {
				vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3)
				await Promise.resolve()
			})
			expect(fetchMock).toHaveBeenCalledTimes(1)

			await act(async () => {
				setVisibility('visible')
				await Promise.resolve()
				await Promise.resolve()
			})
			expect(fetchMock).toHaveBeenCalledTimes(2)

			await advanceOneInterval()
			expect(fetchMock).toHaveBeenCalledTimes(3)
		})
	})
})
