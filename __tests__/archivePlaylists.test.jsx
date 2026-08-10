import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {
	render,
	screen,
	cleanup,
	fireEvent,
	waitFor,
} from '@testing-library/react'

const push = vi.fn()
let routerQuery = {}
let routerIsReady = true

vi.mock('next/router', () => ({
	useRouter: () => ({
		isReady: routerIsReady,
		query: routerQuery,
		push,
	}),
}))

vi.mock('next/head', () => ({
	default: ({children}) => <>{children}</>,
}))

const ArchivePlaylists = (await import('../pages/playlists/archive')).default

function track(overrides = {}) {
	return {
		id: 100,
		show_id: 1,
		play_order: 1,
		add_time: '2026-08-03T14:05:00.000Z', // Monday 10:05 AM ET
		entry_type: 'track',
		artist_name: 'Juana Molina',
		track_title: 'la paradoja',
		album_title: 'DOGA',
		record_label: 'Sonamos',
		request_flag: false,
		...overrides,
	}
}

const RANGE = {
	shows: [
		{
			id: 1,
			dj_name: 'DJ Biscuit',
			show_name: null,
			specialty_id: null,
			start_time: '2026-08-03T14:00:00.000Z',
			end_time: '2026-08-03T17:00:00.000Z',
		},
	],
	entries: [
		{
			id: 99,
			show_id: 1,
			play_order: 0,
			add_time: '2026-08-03T14:00:00.000Z',
			entry_type: 'show_start',
		},
		track(),
		track({
			id: 101,
			play_order: 2,
			artist_name: 'Jessica Pratt',
			track_title: 'Back, Baby',
			album_title: 'On Your Own Love Again',
			record_label: 'Drag City',
			rotation_bin: 'H',
			request_flag: true,
		}),
		{
			id: 102,
			show_id: 1,
			play_order: 3,
			add_time: '2026-08-03T14:20:00.000Z',
			entry_type: 'talkset',
			message: 'TALKSET',
		},
	],
}

function mockFetchOnce(body, {ok = true, status = 200} = {}) {
	global.fetch = vi.fn().mockResolvedValue({
		ok,
		status,
		json: () => Promise.resolve(body),
	})
	return global.fetch
}

beforeEach(() => {
	vi.clearAllMocks()
	routerQuery = {week: '2026-08-03'}
	routerIsReady = true
})

afterEach(() => {
	cleanup()
})

describe('Playlist archive page', () => {
	it('shows a loading state before the fetch resolves', () => {
		global.fetch = vi.fn(() => new Promise(() => {}))
		render(<ArchivePlaylists />)

		expect(screen.getByRole('status')).toHaveProperty(
			'textContent',
			expect.stringContaining('Loading')
		)
	})

	it('renders each day of the week and the shows within it', async () => {
		mockFetchOnce(RANGE)
		render(<ArchivePlaylists />)

		await screen.findByText('DJ Biscuit')
		// All seven days get a heading, so the whole week is browsable even when
		// only one of them has playlists.
		expect(screen.getByText('Monday, August 3, 2026')).toBeDefined()
		expect(screen.getByText('Sunday, August 9, 2026')).toBeDefined()
		expect(
			screen.getAllByText('No playlists recorded for this day.')
		).toHaveLength(6)
	})

	it('renders track rows with artist, song, release and label', async () => {
		mockFetchOnce(RANGE)
		render(<ArchivePlaylists />)

		await screen.findByText('Juana Molina')
		expect(screen.getByText('la paradoja')).toBeDefined()
		expect(screen.getByText('DOGA')).toBeDefined()
		expect(screen.getByText('Sonamos')).toBeDefined()
		expect(screen.getByText('Jessica Pratt')).toBeDefined()
		expect(screen.getByText('(request)')).toBeDefined()
	})

	it('keeps each playlist collapsed behind its schedule line', async () => {
		// A week is 2,300-2,800 entries in production. The schedule stays visible;
		// the rows only get laid out when a visitor opens one.
		mockFetchOnce(RANGE)
		const {container} = render(<ArchivePlaylists />)

		await screen.findByText('DJ Biscuit')
		const details = container.querySelectorAll('details')
		expect(details).toHaveLength(1)
		expect(details[0].open).toBe(false)
		// Track count on the summary, so the schedule line is informative closed.
		expect(details[0].querySelector('summary').textContent).toContain(
			'2 tracks'
		)
	})

	it('renders talksets and breakpoints as separators rather than blank rows', async () => {
		mockFetchOnce(RANGE)
		render(<ArchivePlaylists />)

		expect(await screen.findByText('TALKSET')).toBeDefined()
	})

	it('does not repeat the show delimiters inside the show they delimit', async () => {
		// show_start / show_end restate the header's DJ and air time.
		mockFetchOnce(RANGE)
		const {container} = render(<ArchivePlaylists />)

		await screen.findByText('DJ Biscuit')
		expect(container.textContent).not.toContain('show start')
		expect(container.textContent).not.toContain('show end')
	})

	it('drops a sign-on/sign-off shell with no air content', async () => {
		mockFetchOnce({
			shows: [
				RANGE.shows[0],
				{
					id: 2,
					dj_name: 'Funland Research',
					show_name: null,
					specialty_id: null,
					start_time: '2026-08-03T21:22:00.000Z',
					end_time: '2026-08-03T21:24:00.000Z',
				},
			],
			entries: [
				...RANGE.entries,
				{
					id: 300,
					show_id: 2,
					play_order: 1,
					add_time: '2026-08-03T21:22:00.000Z',
					entry_type: 'show_start',
				},
				{
					id: 301,
					show_id: 2,
					play_order: 2,
					add_time: '2026-08-03T21:24:00.000Z',
					entry_type: 'show_end',
				},
			],
		})
		render(<ArchivePlaylists />)

		await screen.findByText('DJ Biscuit')
		expect(screen.queryByText('Funland Research')).toBeNull()
	})

	it('renders an entry with a null show_id as unattributed', async () => {
		mockFetchOnce({
			shows: RANGE.shows,
			entries: [
				...RANGE.entries,
				track({
					id: 200,
					show_id: null,
					artist_name: 'Nilüfer Yanya',
					track_title: 'Stabilise',
					add_time: '2026-08-03T20:00:00.000Z',
				}),
			],
		})
		render(<ArchivePlaylists />)

		expect(await screen.findByText('Unattributed')).toBeDefined()
		expect(screen.getByText('Nilüfer Yanya')).toBeDefined()
	})

	it('renders an empty week without erroring', async () => {
		mockFetchOnce({shows: [], entries: []})
		render(<ArchivePlaylists />)

		expect(
			await screen.findByText('No playlists were recorded this week.')
		).toBeDefined()
	})

	it('renders a fetch failure as an alert with a retry', async () => {
		mockFetchOnce(null, {ok: false, status: 503})
		render(<ArchivePlaylists />)

		const alert = await screen.findByRole('alert')
		expect(alert.textContent).toContain('503')
		expect(screen.getByRole('button', {name: 'Retry'})).toBeDefined()
	})

	it('renders a 400 as guidance to pick another week', async () => {
		mockFetchOnce(null, {ok: false, status: 400})
		render(<ArchivePlaylists />)

		const alert = await screen.findByRole('alert')
		expect(alert.textContent).toContain('different week')
	})

	it('reads the week from the query string', async () => {
		routerQuery = {week: '2026-08-05'} // a Wednesday
		const fetchMock = mockFetchOnce({shows: [], entries: []})
		render(<ArchivePlaylists />)

		await waitFor(() => expect(fetchMock).toHaveBeenCalled())
		// Snapped back to its Monday.
		expect(screen.getByText(/Week of August 3, 2026/)).toBeDefined()
	})

	it.each([
		['a malformed date', 'not-a-date'],
		['a nonexistent date', '2026-02-31'],
	])('falls back to the current week given %s', async (_label, week) => {
		routerQuery = {week}
		const fetchMock = mockFetchOnce({shows: [], entries: []})
		render(<ArchivePlaylists />)

		await waitFor(() => expect(fetchMock).toHaveBeenCalled())
		const url = new URL(fetchMock.mock.calls[0][0])
		expect(Number(url.searchParams.get('start'))).toBeLessThanOrEqual(
			Date.now()
		)
	})

	it('puts the week in the URL when navigating, so a week is linkable', async () => {
		mockFetchOnce({shows: [], entries: []})
		render(<ArchivePlaylists />)

		const previous = await screen.findByRole('button', {name: /Previous week/})
		fireEvent.click(previous)

		await waitFor(() =>
			expect(push).toHaveBeenCalledWith(
				'/playlists/archive?week=2026-07-27',
				undefined,
				{shallow: true}
			)
		)
	})

	it('disables forward navigation past the current week', async () => {
		routerQuery = {}
		mockFetchOnce({shows: [], entries: []})
		render(<ArchivePlaylists />)

		await waitFor(() =>
			expect(screen.getByRole('button', {name: /Next week/}).disabled).toBe(
				true
			)
		)
	})

	it('requests a 7-day window and never more', async () => {
		const fetchMock = mockFetchOnce({shows: [], entries: []})
		render(<ArchivePlaylists />)

		await waitFor(() => expect(fetchMock).toHaveBeenCalled())
		const url = new URL(fetchMock.mock.calls[0][0])
		const span =
			Number(url.searchParams.get('end')) -
			Number(url.searchParams.get('start'))
		expect(span).toBeLessThanOrEqual(8 * 24 * 60 * 60 * 1000)
	})

	it('sends no credentials', async () => {
		const fetchMock = mockFetchOnce({shows: [], entries: []})
		render(<ArchivePlaylists />)

		await waitFor(() => expect(fetchMock).toHaveBeenCalled())
		expect(fetchMock.mock.calls[0][1].credentials).toBe('omit')
	})
})
