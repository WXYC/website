import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, act} from '@testing-library/react'
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

		await act(async () => {
			vi.advanceTimersByTime(REFRESH_INTERVAL_MS)
			await Promise.resolve()
			await Promise.resolve()
		})

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
})
