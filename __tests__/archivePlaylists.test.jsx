import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {createMockFetch, createTestLifecycle, testData} from './test-utils'
import {clearWeekCache} from '../lib/weekCache'
import {
	addDays,
	easternMidnightEpoch,
	easternToday,
	startOfWeek,
} from '../lib/easternTime'

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

const track = testData.flowsheetTrack

const RANGE = {
	shows: [testData.flowsheetShow()],
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

function mockFetchOnce(body, options) {
	global.fetch = createMockFetch(body, options)
	return global.fetch
}

const lifecycle = createTestLifecycle()

beforeEach(() => {
	lifecycle.beforeEach()
	routerQuery = {week: '2026-08-03'}
	routerIsReady = true
	// The week cache outlives an unmount by design, so it also outlives a test.
	clearWeekCache()
})

afterEach(lifecycle.afterEach)

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
		expect(Number(url.searchParams.get('start'))).toBe(
			easternMidnightEpoch(startOfWeek(easternToday()))
		)
	})

	it.each([
		['before the archive begins', '1970-01-05', '2004-11-01'],
		['a partially-typed year', '0202-08-10', '2004-11-01'],
	])(
		'clamps a week %s to the archive rather than querying for it',
		async (_label, week, expectedDate) => {
			// `<input type="date">` fires onChange on each keystroke of a typed year,
			// so 0202 is a value a visitor produces just by editing the field, and
			// ?week= accepts anything at all. Neither should reach the backend.
			routerQuery = {week}
			const fetchMock = mockFetchOnce({shows: [], entries: []})
			render(<ArchivePlaylists />)

			await waitFor(() => expect(fetchMock).toHaveBeenCalled())
			const url = new URL(fetchMock.mock.calls[0][0])
			expect(Number(url.searchParams.get('start'))).toBe(
				easternMidnightEpoch(startOfWeek(expectedDate))
			)
		}
	)

	it('does not fetch until the router has resolved the query string', async () => {
		// A statically exported page renders once with an empty query string. If
		// that render fetches, every deep link costs two full weeks of data.
		routerIsReady = false
		routerQuery = {}
		const fetchMock = mockFetchOnce({shows: [], entries: []})
		const {rerender} = render(<ArchivePlaylists />)

		expect(fetchMock).not.toHaveBeenCalled()
		expect(screen.getByRole('status')).toBeDefined()

		routerIsReady = true
		routerQuery = {week: '2026-07-06'}
		rerender(<ArchivePlaylists />)

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		const url = new URL(fetchMock.mock.calls[0][0])
		expect(Number(url.searchParams.get('start'))).toBe(
			easternMidnightEpoch('2026-07-06')
		)
	})

	it('serves a past week it has already fetched from memory', async () => {
		// A week is half a megabyte gzipped and the endpoint sends no
		// Cache-Control, so paging away and back must not re-download it.
		const fetchMock = mockFetchOnce(RANGE)
		const {unmount} = render(<ArchivePlaylists />)
		await screen.findByText('DJ Biscuit')
		expect(fetchMock).toHaveBeenCalledTimes(1)

		unmount()
		render(<ArchivePlaylists />)

		await screen.findByText('DJ Biscuit')
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('refetches the current week rather than serving a stale copy', async () => {
		// The week in progress is still being written to as shows air.
		const monday = startOfWeek(easternToday())
		routerQuery = {week: monday}
		const fetchMock = mockFetchOnce({shows: [], entries: []})
		const {unmount} = render(<ArchivePlaylists />)
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

		unmount()
		render(<ArchivePlaylists />)

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
	})

	it('does not describe days that have not aired yet as missing', async () => {
		// The current week's landing view is otherwise several days captioned as
		// though the archive had lost them.
		const monday = startOfWeek(easternToday())
		const dates = Array.from({length: 7}, (_, i) => addDays(monday, i))
		const elapsed = dates.filter((date) => date <= easternToday())

		routerQuery = {week: monday}
		mockFetchOnce({
			shows: [
				testData.flowsheetShow({
					start_time: `${monday}T14:00:00.000Z`,
					end_time: `${monday}T17:00:00.000Z`,
				}),
			],
			entries: [testData.flowsheetTrack({add_time: `${monday}T14:05:00.000Z`})],
		})
		render(<ArchivePlaylists />)

		await screen.findByText('DJ Biscuit')
		expect(screen.queryAllByText('Not yet aired.')).toHaveLength(
			dates.length - elapsed.length
		)
		// Every elapsed day but Monday, which has the show.
		expect(
			screen.queryAllByText('No playlists recorded for this day.')
		).toHaveLength(elapsed.length - 1)
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

	it('requests exactly the Eastern week it is showing', async () => {
		const fetchMock = mockFetchOnce({shows: [], entries: []})
		render(<ArchivePlaylists />)

		await waitFor(() => expect(fetchMock).toHaveBeenCalled())
		const url = new URL(fetchMock.mock.calls[0][0])
		expect(Number(url.searchParams.get('start'))).toBe(
			easternMidnightEpoch('2026-08-03')
		)
		expect(Number(url.searchParams.get('end'))).toBe(
			easternMidnightEpoch('2026-08-10')
		)
	})

	it('sends no credentials', async () => {
		const fetchMock = mockFetchOnce({shows: [], entries: []})
		render(<ArchivePlaylists />)

		await waitFor(() => expect(fetchMock).toHaveBeenCalled())
		expect(fetchMock.mock.calls[0][1].credentials).toBe('omit')
	})
})
