import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, act, fireEvent, waitFor} from '@testing-library/react'
import {createMockFetch, createTestLifecycle, testData} from './test-utils'

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

beforeEach(() => {
	lifecycle.beforeEach()
	push.mockClear()
	routerQuery = {}
	routerIsReady = true
})
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

	it('dates every track row on the station clock, not the reader’s', async () => {
		// 14:05 UTC is 10:05 AM in Chapel Hill on the 3rd. The test runs in
		// whatever zone the machine is in, so a row dated by the reader's
		// clock would drift and this assertion would catch it.
		mockFetchOnce(envelope([track({add_time: '2026-08-03T14:05:00.000Z'})]))
		render(<LivePlaylist />)
		await flushPromises()

		const row = screen.getByText('Juana Molina').closest('tr')
		expect(row.textContent).toContain('08/03/2026')
	})

	it('leaves the date cell empty rather than printing a placeholder when add_time is unusable', async () => {
		mockFetchOnce(envelope([track({add_time: null})]))
		render(<LivePlaylist />)
		await flushPromises()

		const row = screen.getByText('Juana Molina').closest('tr')
		const cells = [...row.querySelectorAll('td')]
		expect(cells).toHaveLength(6)
		expect(cells.at(-1).textContent).toBe('')
	})

	it('keeps a separator row spanning the full width of the widened table', async () => {
		mockFetchOnce(
			envelope([
				track({id: 200, play_order: 2}),
				{
					id: 199,
					show_id: 1,
					play_order: 1,
					add_time: '2026-08-03T13:00:00.000Z',
					entry_type: 'talkset',
					message: 'TALKSET',
				},
			])
		)
		render(<LivePlaylist />)
		await flushPromises()

		// The band is what makes these rows read as structure (#243); a
		// colSpan left behind at 5 would silently open a gap in it.
		const cell = screen.getByText('TALKSET').closest('td')
		expect(cell.getAttribute('colspan')).toBe('6')
	})

	it('marks a requested track', async () => {
		mockFetchOnce(envelope([track({request_flag: true})]))
		render(<LivePlaylist />)
		await flushPromises()

		const row = screen.getByText('Juana Molina').closest('tr')
		expect(row.querySelector('td').textContent).toContain('Listener request')
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

	it('renders a response missing its entries array as an error, not a false empty state', async () => {
		// `data?.entries ?? []` would render "Nothing has aired recently" for
		// this response — a confident lie about a live radio station. The
		// endpoint and its own spec already disagree about this envelope's
		// shape (api.yaml documents a bare `type: array` for `GET /flowsheet`
		// today), so a shape regression here has to be loud, not a quiet blank.
		mockFetchOnce({
			total: 2634069,
			page: 0,
			limit: 50,
			totalPages: 52682,
			on_air: null,
		})
		render(<LivePlaylist />)
		await flushPromises()

		const alert = await screen.findByRole('alert')
		expect(alert).toBeDefined()
		expect(screen.queryByText(/nothing.*aired/i)).toBeNull()
	})

	it('renders a non-array entries value as an error, not a false empty state', async () => {
		mockFetchOnce(envelope('not-an-array'))
		render(<LivePlaylist />)
		await flushPromises()

		const alert = await screen.findByRole('alert')
		expect(alert).toBeDefined()
		expect(screen.queryByText(/nothing.*aired/i)).toBeNull()
	})

	it('paints the separator row a fill that reads as a band', async () => {
		// The source-level guard in `playlistContrast.test.js` can only see
		// that the page paints *a* fill somewhere — it cannot see whether the
		// fill is still on this row. Delete the class here and that guard
		// stays green, and on this page especially, because the stale-data
		// banner paints the same `bg-white/10` and keeps a match alive. So
		// the row asserts for itself, from the DOM it actually renders.
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

		const cell = screen.getByText('TALKSET').closest('td')
		const fill = cell.className.match(/bg-white\/(\d+)/)

		expect(fill).not.toBeNull()
		expect(Number(fill[1]) / 100).toBeGreaterThanOrEqual(0.1)
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

		// A cell that renders `undefined` or `null` produces no text node at
		// all in React, never the literal string "undefined" — so the only
		// assertion that can actually catch a blank separator row is that its
		// content is non-empty, not that a literal "undefined" is absent.
		const separatorRow = screen.getByText('TALKSET').closest('tr')
		expect(separatorRow.textContent.trim()).not.toBe('')

		const keyWarning = consoleError.mock.calls.some((call) =>
			call.some((arg) => typeof arg === 'string' && arg.includes('key'))
		)
		expect(keyWarning).toBe(false)

		consoleError.mockRestore()
	})

	it('handles every non-track entry type the backend can send', async () => {
		mockFetchOnce(
			envelope([
				track({id: 310, play_order: 8}),
				{
					id: 309,
					show_id: 1,
					play_order: 7,
					add_time: '2026-08-10T23:01:20.191Z',
					entry_type: 'show_end',
					dj_name: 'DJ Decent',
					timestamp: '8/10/2026, 7:01:20 PM',
				},
				{
					id: 308,
					show_id: 1,
					play_order: 6,
					add_time: '2026-08-10T23:01:00.000Z',
					entry_type: 'dj_leave',
					dj_name: 'DJ Guest',
				},
				{
					id: 307,
					show_id: 1,
					play_order: 5,
					add_time: '2026-08-10T23:01:17.402Z',
					entry_type: 'breakpoint',
					message: '--- 7:00 PM BREAKPOINT ---',
					radio_hour: '2026-08-10T23:00:00.000Z',
				},
				{
					id: 306,
					show_id: 1,
					play_order: 4,
					add_time: '2026-08-10T22:58:00.000Z',
					entry_type: 'message',
					message: 'Technical difficulties, back shortly',
				},
				{
					id: 305,
					show_id: 1,
					play_order: 3,
					add_time: '2026-08-10T22:57:31.357Z',
					entry_type: 'talkset',
					message: 'TALKSET',
				},
				{
					id: 304,
					show_id: 1,
					play_order: 2,
					add_time: '2026-08-10T22:39:10.563Z',
					entry_type: 'show_start',
					dj_name: 'DJ Decent',
					timestamp: '8/10/2026, 6:39:10 PM',
				},
				{
					id: 303,
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

		// show_start / show_end carry no `message` — they name the DJ in
		// `dj_name`, and are labelled from it rather than from the wire token.
		// Asserting the wording, not merely that the row is non-empty: the
		// fallback these used to reach printed a legible-looking "show start"
		// and so would have survived an emptiness check.
		expect(screen.getByText('DJ Decent signed on at 6:39 PM')).toBeDefined()
		expect(screen.getByText('DJ Decent signed off at 7:01 PM')).toBeDefined()
		expect(screen.queryByText(/show start/i)).toBeNull()
		expect(screen.queryByText(/show end/i)).toBeNull()
		expect(screen.getByText(/DJ Guest joined/)).toBeDefined()
		expect(screen.getByText(/DJ Guest left/)).toBeDefined()
		expect(screen.getByText('--- 7:00 PM BREAKPOINT ---')).toBeDefined()
		expect(
			screen.getByText('Technical difficulties, back shortly')
		).toBeDefined()
		expect(screen.getByText('TALKSET')).toBeDefined()
	})

	describe('searching from the playlist', () => {
		it('hands the query to the airplay search page rather than filtering what is on screen', async () => {
			// A box that filtered the 50 rows on screen would look like it
			// searched the archive and quietly not. Handing off means one
			// search implementation, and everything `lib/flowsheetSearch.js`
			// knows about field filters and paging depth applies to it.
			mockFetchOnce(envelope([track()]))
			render(<LivePlaylist />)
			await flushPromises()

			fireEvent.change(screen.getByRole('searchbox'), {
				target: {value: 'Jessica Pratt'},
			})
			fireEvent.submit(screen.getByRole('search'))

			expect(push).toHaveBeenCalledWith('/airplay-search?q=Jessica+Pratt')
		})

		it('encodes a query with search syntax in it', async () => {
			mockFetchOnce(envelope([track()]))
			render(<LivePlaylist />)
			await flushPromises()

			fireEvent.change(screen.getByRole('searchbox'), {
				target: {value: 'artist:foo AND album:"bar"'},
			})
			fireEvent.submit(screen.getByRole('search'))

			const [target] = push.mock.calls[0]
			expect(new URL(target, 'https://wxyc.org').searchParams.get('q')).toBe(
				'artist:foo AND album:"bar"'
			)
		})

		it('does nothing on an empty submit rather than navigating away', async () => {
			mockFetchOnce(envelope([track()]))
			render(<LivePlaylist />)
			await flushPromises()

			fireEvent.submit(screen.getByRole('search'))

			expect(push).not.toHaveBeenCalled()
		})
	})

	describe('stepping back through sets', () => {
		const signOn = {
			id: 300,
			show_id: 42,
			play_order: 1,
			add_time: '2026-08-10T22:39:10.563Z',
			entry_type: 'show_start',
			dj_name: 'DJ Decent',
		}
		const signOff = {
			id: 309,
			show_id: 42,
			play_order: 9,
			add_time: '2026-08-11T01:01:20.191Z',
			entry_type: 'show_end',
			dj_name: 'DJ Decent',
		}
		const setRows = [
			signOff,
			track({id: 305, show_id: 42, play_order: 5}),
			signOn,
		]

		it('asks for one whole set, not a window of rows', async () => {
			routerQuery = {set: '2'}
			const fetchImpl = mockFetchOnce(setRows)
			render(<LivePlaylist />)

			await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
			const url = new URL(fetchImpl.mock.calls[0][0])
			expect(url.searchParams.get('shows_limit')).toBe('1')
			expect(url.searchParams.get('page')).toBe('2')
		})

		it('captions the set from its own delimiter rows', async () => {
			// This endpoint branch returns no `shows` metadata, so a header
			// that named the DJ some other way would be naming them from
			// nothing.
			routerQuery = {set: '1'}
			mockFetchOnce(setRows)
			render(<LivePlaylist />)

			await screen.findByText('DJ Decent')
			expect(screen.getByText(/08\/10\/2026/)).toBeDefined()
			expect(screen.getByText(/6:39 PM – 9:01 PM/)).toBeDefined()
		})

		it('reads newest-first, like the landing view above it', async () => {
			// Pinned deliberately. The archive page renders the same show
			// chronologically and dj-site does too, so this looks like an
			// oversight and has already been reported as one. It is not: the
			// reading direction belongs to the page, and inverting the list
			// when a reader steps back one set is the thing being avoided.
			// Change it only on purpose.
			routerQuery = {set: '1'}
			mockFetchOnce(setRows)
			render(<LivePlaylist />)
			await screen.findByText('DJ Decent signed off at 9:01 PM')

			const rows = [...document.querySelectorAll('tbody tr')]
			expect(rows[0].textContent).toContain('signed off')
			expect(rows.at(-1).textContent).toContain('signed on')
		})

		it('does not poll an archived set', async () => {
			// A set that has already aired cannot change. Polling it every
			// minute would be pure waste, and the landing view's whole reason
			// for a 60s interval — that the current show is still being
			// written — does not apply.
			vi.useFakeTimers()
			routerQuery = {set: '1'}
			const fetchImpl = mockFetchOnce(setRows)
			render(<LivePlaylist />)
			await flushPromises()
			await advanceOneInterval()
			await advanceOneInterval()

			expect(fetchImpl).toHaveBeenCalledTimes(1)
		})

		it('reports an empty set as empty, not as a failure, and keeps the way out', async () => {
			// Backend answers a set with no rows — and paging past the oldest
			// show — with the same 404. Neither is an outage, and neither is
			// proof the archive has ended, so the navigation is untouched.
			routerQuery = {set: '4000'}
			mockFetchOnce({message: 'No Tracks found'}, {ok: false, status: 404})
			render(<LivePlaylist />)

			await screen.findByText(/Nothing was logged for this set/)
			expect(screen.queryByRole('alert')).toBeNull()
			expect(screen.getByRole('button', {name: /Previous set/})).toBeDefined()
		})

		it('renders a real failure as an alert that is not also a dead end', async () => {
			routerQuery = {set: '1'}
			mockFetchOnce(null, {ok: false, status: 503})
			render(<LivePlaylist />)

			const alert = await screen.findByRole('alert')
			expect(alert.textContent).toContain('503')
			expect(screen.getByRole('button', {name: /Previous set/})).toBeDefined()
		})

		it('keeps the controls reachable while the set is still loading', async () => {
			// They used to be rendered only inside the loaded and errored
			// branches, so the state you most want to leave — a slow or stuck
			// load — was the one state with no way out of it.
			routerQuery = {set: '2'}
			global.fetch = vi.fn(() => new Promise(() => {}))
			render(<LivePlaylist />)

			expect(
				screen.getByRole('navigation', {name: /move between sets/i})
			).toBeDefined()
			expect(screen.getByRole('status').textContent).toContain('Loading')
		})

		it('says the DJ is unknown, not that the set is unattributed', async () => {
			// `lib/flowsheetRange.js` reserves those two words for different
			// facts. "Unattributed" means rows that belong to no show, which
			// this endpoint cannot return — it is addressed by show. Using it
			// here would tell a reader something false about the data.
			routerQuery = {set: '1'}
			mockFetchOnce([
				{
					id: 400,
					show_id: 42,
					play_order: 1,
					add_time: '2026-08-10T22:39:10.563Z',
					entry_type: 'show_start',
					dj_name: '',
				},
				track({id: 401, show_id: 42, play_order: 2}),
			])
			render(<LivePlaylist />)
			await screen.findByText('Juana Molina')

			expect(screen.getByText('Unknown DJ')).toBeDefined()
			expect(screen.queryByText(/Unattributed/i)).toBeNull()
		})

		it('places the controls before the list in document order', async () => {
			// On a set that can run to several hundred rows, navigation below
			// the fold is navigation nobody finds.
			routerQuery = {set: '1'}
			mockFetchOnce(setRows)
			render(<LivePlaylist />)
			await screen.findByText('DJ Decent')

			const nav = screen.getByRole('navigation', {name: /move between sets/i})
			const table = document.querySelector('table')

			expect(
				nav.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
			).toBeTruthy()
		})

		it('offers one way out of the landing view, and names it for what it is', async () => {
			// The landing view is a window of recent rows spanning several
			// sets; a set is one show. Labelling both halves "page" would
			// promise a sequence they do not share.
			mockFetchOnce(envelope([track()]))
			render(<LivePlaylist />)
			await flushPromises()

			const earlier = screen.getByRole('button', {name: /Earlier sets/})
			expect(screen.queryByRole('button', {name: /Next set/})).toBeNull()

			fireEvent.click(earlier)
			expect(push).toHaveBeenCalledWith('/playlist?set=1', undefined, {
				shallow: true,
			})
		})

		it('returns to the landing view from the first set rather than calling it the next set', async () => {
			routerQuery = {set: '1'}
			mockFetchOnce(setRows)
			render(<LivePlaylist />)
			await screen.findByText('DJ Decent')

			fireEvent.click(screen.getByRole('button', {name: /Now playing/}))
			expect(push).toHaveBeenCalledWith('/playlist', undefined, {
				shallow: true,
			})
		})

		it('steps further back from a set', async () => {
			routerQuery = {set: '3'}
			mockFetchOnce(setRows)
			render(<LivePlaylist />)
			await screen.findByText('DJ Decent')

			expect(screen.getByText('3 sets back')).toBeDefined()
			fireEvent.click(screen.getByRole('button', {name: /Previous set/}))
			expect(push).toHaveBeenCalledWith('/playlist?set=4', undefined, {
				shallow: true,
			})
		})

		it('does not render an archived set as the live playlist after Back', async () => {
			// The regression #216 warned about, in a new place. `goToSet` is
			// not the only thing that changes `setPage` — Back and Forward
			// change `?set=` through the router-query effect, which calls no
			// handler of ours. Every other test in this file drives the set
			// through a button, so none of them can reach this path: the
			// router mock's `push` never writes back to `routerQuery`.
			routerQuery = {set: '1'}
			// The landing fetch is left pending on purpose. The defect was that
			// the archived set stayed on screen *while it was in flight*, with
			// no spinner, so the assertion has to be made in that window
			// rather than after fresh data has replaced it.
			global.fetch = vi.fn((url) =>
				String(url).includes('shows_limit')
					? Promise.resolve({
							ok: true,
							status: 200,
							json: () => Promise.resolve(setRows),
						})
					: new Promise(() => {})
			)

			const {rerender} = render(<LivePlaylist />)
			await screen.findByText('DJ Decent')
			expect(screen.getByText('Juana Molina')).toBeDefined()

			// Back: the URL loses `?set=`, and nothing else happens.
			routerQuery = {}
			await act(async () => {
				rerender(<LivePlaylist />)
			})

			// The heading has flipped, so the set's rows must not still be
			// under it — neither captioned as live, nor with no spinner.
			expect(screen.queryByText('DJ Decent')).toBeNull()
			expect(screen.queryByText('Juana Molina')).toBeNull()
			expect(screen.getByRole('status').textContent).toContain('Loading')
		})

		it('does not carry a failed set’s error onto the live playlist after Back', async () => {
			// The sharper variant: `error` survives the same way `entries`
			// does, so backing out of a set that 503'd put its alert under the
			// "Live Playlist" heading.
			routerQuery = {set: '1'}
			// Landing fetch left pending for the same reason as above: if it
			// resolves, `load` clears the error incidentally and the test
			// passes whether or not the effect clears it on entry.
			global.fetch = vi.fn((url) =>
				String(url).includes('shows_limit')
					? Promise.resolve({ok: false, status: 503, json: () => ({})})
					: new Promise(() => {})
			)

			const {rerender} = render(<LivePlaylist />)
			const alert = await screen.findByRole('alert')
			expect(alert.textContent).toContain('503')

			routerQuery = {}
			await act(async () => {
				rerender(<LivePlaylist />)
			})

			expect(screen.queryByRole('alert')).toBeNull()
		})

		it.each([['0'], ['-1'], ['1.5'], ['abc'], ['999999']])(
			'treats ?set=%s as the landing view rather than as an error',
			async (value) => {
				routerQuery = {set: value}
				const fetchImpl = mockFetchOnce(envelope([track()]))
				render(<LivePlaylist />)
				await waitFor(() => expect(fetchImpl).toHaveBeenCalled())

				const url = new URL(fetchImpl.mock.calls[0][0])
				expect(url.searchParams.get('shows_limit')).toBeNull()
				expect(screen.getByRole('button', {name: /Earlier sets/})).toBeDefined()
			}
		)

		it('waits for the router before fetching anything', async () => {
			// On a static export the query string is empty on the first render.
			// Fetching the landing view before reading it would spend a request
			// on the wrong view for every shared set link.
			routerIsReady = false
			routerQuery = {set: '1'}
			const fetchImpl = mockFetchOnce(setRows)
			render(<LivePlaylist />)
			await flushPromises()

			expect(fetchImpl).not.toHaveBeenCalled()
			expect(screen.getByRole('status').textContent).toContain('Loading')
		})
	})

	it('shows who is currently on the air', async () => {
		mockFetchOnce(envelope([track()], {on_air: {dj_name: 'DJ OVNI'}}))
		render(<LivePlaylist />)
		await flushPromises()

		expect(screen.getByText(/DJ OVNI/)).toBeDefined()
	})

	it('reports Auto DJ when on_air is confirmed automation (explicit null), not the generic tagline', async () => {
		// api.yaml makes this a deliberate three-way distinction: an object
		// names a live DJ, JSON `null` confirms automation, and an absent key
		// means unknown. `data?.on_air?.dj_name ?? null` collapses the middle
		// case into the same rendering as "unknown", so during automation the
		// page would show the generic tagline instead of naming Auto DJ.
		mockFetchOnce(envelope([track()], {on_air: null}))
		render(<LivePlaylist />)
		await flushPromises()

		expect(screen.getByText(/Auto DJ/)).toBeDefined()
		expect(screen.queryByText(/most recent songs on WXYC/i)).toBeNull()
	})

	it('shows the generic tagline when on_air is absent rather than claiming automation', async () => {
		const {entries} = envelope([track()])
		mockFetchOnce({entries, total: 1, page: 0, limit: 50, totalPages: 1})
		render(<LivePlaylist />)
		await flushPromises()

		expect(screen.getByText(/most recent songs on WXYC/i)).toBeDefined()
		expect(screen.queryByText(/Auto DJ/)).toBeNull()
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

	describe('loading state across a superseded first load (regression)', () => {
		// Regression coverage for a bug introduced by the in-flight-guard fix:
		// the `finally` that cleared `isLoading` gated on the request's own
		// controller still being the current one. Every superseding call aborts
		// the previous controller before its own fetch resolves, so the first
		// load's `finally` always saw a stale controller and skipped clearing
		// `isLoading` — and the replacement never set it either, since it only
		// cleared loading for calls that had requested the spinner. Once stuck,
		// no later tick recovers: the page is pinned on "Loading the playlist…"
		// forever even though fresh data has arrived.

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

		it('clears the loading state when the 60s interval supersedes a still-pending first load', async () => {
			vi.useFakeTimers()
			let resolveFirst
			const firstResponse = new Promise((resolve) => {
				resolveFirst = resolve
			})
			const fetchMock = vi
				.fn()
				.mockImplementationOnce(() => firstResponse)
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => envelope([track()]),
				})
			global.fetch = fetchMock

			render(<LivePlaylist />)
			await flushPromises()
			expect(fetchMock).toHaveBeenCalledTimes(1)
			expect(document.body.textContent).toContain('Loading the playlist')

			// The interval fires while the first fetch is still unsettled.
			await advanceOneInterval()

			expect(fetchMock).toHaveBeenCalledTimes(2)
			expect(document.body.textContent).not.toContain('Loading the playlist')
			expect(screen.getByText('Juana Molina')).toBeDefined()

			// The slow first fetch finally resolves, late and superseded. It must
			// not resurrect the loading state or clobber the newer data.
			await act(async () => {
				resolveFirst({
					ok: true,
					status: 200,
					json: async () =>
						envelope([track({id: 2, artist_name: 'Someone Else'})]),
				})
				await Promise.resolve()
				await Promise.resolve()
			})
			expect(document.body.textContent).not.toContain('Loading the playlist')
			expect(screen.getByText('Juana Molina')).toBeDefined()
		})

		it('clears the loading state when a visibility flip supersedes a still-pending first load', async () => {
			let resolveFirst
			const firstResponse = new Promise((resolve) => {
				resolveFirst = resolve
			})
			const fetchMock = vi
				.fn()
				.mockImplementationOnce(() => firstResponse)
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => envelope([track()]),
				})
			global.fetch = fetchMock

			render(<LivePlaylist />)
			await flushPromises()
			expect(fetchMock).toHaveBeenCalledTimes(1)
			expect(document.body.textContent).toContain('Loading the playlist')

			// A hidden -> visible flip while the first fetch is still unsettled
			// triggers a superseding catch-up fetch, same as the interval case.
			await act(async () => {
				setVisibility('hidden')
				await Promise.resolve()
			})
			await act(async () => {
				setVisibility('visible')
				await Promise.resolve()
				await Promise.resolve()
			})

			expect(fetchMock).toHaveBeenCalledTimes(2)
			expect(document.body.textContent).not.toContain('Loading the playlist')
			expect(screen.getByText('Juana Molina')).toBeDefined()

			await act(async () => {
				resolveFirst({
					ok: true,
					status: 200,
					json: async () =>
						envelope([track({id: 2, artist_name: 'Someone Else'})]),
				})
				await Promise.resolve()
				await Promise.resolve()
			})
			expect(document.body.textContent).not.toContain('Loading the playlist')
			expect(screen.getByText('Juana Molina')).toBeDefined()
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

		it('never fetches when the tab starts hidden and is never made visible', async () => {
			// `visibilityState` is pinned to 'hidden' before the component even
			// mounts, simulating a tab opened in the background (e.g. cmd-click)
			// that is never focused. `visibilitychange` only fires on a
			// transition, so a gate that consults `document.visibilityState`
			// solely from inside that handler never engages here: it would fetch
			// once on mount and then once per interval tick forever, exactly the
			// traffic the gating exists to prevent.
			vi.useFakeTimers()
			setVisibility('hidden')
			const fetchMock = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => envelope([track()]),
			})
			global.fetch = fetchMock

			render(<LivePlaylist />)
			await flushPromises()
			expect(fetchMock).toHaveBeenCalledTimes(0)

			await act(async () => {
				vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3)
				await Promise.resolve()
			})
			expect(fetchMock).toHaveBeenCalledTimes(0)
		})
	})

	it('sits the playlist on an opaque surface, not directly on the animated background', async () => {
		// Text over the moving background has no stable contrast ratio, so some
		// frames fall below legible. The surface makes contrast a constant
		// instead — see WXYC/website#234.
		mockFetchOnce(envelope([track()]))
		render(<LivePlaylist />)
		await flushPromises()

		expect(
			screen.getByRole('table').closest('[data-readable-surface]')
		).not.toBeNull()
	})

	describe('rotation', () => {
		it('marks a rotation playcut without naming the bin it came from', async () => {
			// The public surface says a record was in rotation; which bin it sat
			// in is library bookkeeping and not part of the answer.
			mockFetchOnce(envelope([track({rotation_bin: 'H'})]))
			render(<LivePlaylist />)
			await flushPromises()

			const row = screen.getByText('Juana Molina').closest('tr')
			expect(row.textContent).toContain('In rotation')
			// Word-bounded: the marker labels legitimately contain those
			// letters ("Listener request"), a bare bin letter would not.
			expect(row.querySelector('td').textContent).not.toMatch(/\b[HMLS]\b/)
		})

		it('marks every bin the same way', async () => {
			mockFetchOnce(
				envelope([
					track({id: 1, rotation_bin: 'H'}),
					track({id: 2, rotation_bin: 'M', track_title: 'Segunda'}),
					track({id: 3, rotation_bin: 'L', track_title: 'Tercera'}),
					track({id: 4, rotation_bin: 'S', track_title: 'Cuarta'}),
				])
			)
			render(<LivePlaylist />)
			await flushPromises()

			expect(screen.getAllByText('In rotation')).toHaveLength(4)
		})

		it('leaves a non-rotation playcut unmarked', async () => {
			mockFetchOnce(envelope([track({rotation_bin: null})]))
			render(<LivePlaylist />)
			await flushPromises()

			expect(screen.queryByText('In rotation')).toBeNull()
		})
	})

	describe('row markers', () => {
		it('prints a key naming both markers above the list', async () => {
			// The table header is sr-only, so without this a sighted reader has
			// nothing on the page that says what a marker means.
			mockFetchOnce(envelope([track({rotation_bin: 'H', request_flag: true})]))
			render(<LivePlaylist />)
			await flushPromises()

			const key = screen.getByRole('list', {name: /what the marks mean/i})
			expect(key.textContent).toMatch(/in rotation/i)
			expect(key.textContent).toMatch(/listener request/i)
		})

		it('marks a listener request in the leading column, not beside the label', async () => {
			mockFetchOnce(envelope([track({request_flag: true})]))
			render(<LivePlaylist />)
			await flushPromises()

			const row = screen.getByText('Juana Molina').closest('tr')
			expect(row.textContent).not.toContain('(request)')
			expect(row.querySelector('td').textContent).toContain('Listener request')
		})

		it('carries both markers on a requested rotation play', async () => {
			mockFetchOnce(envelope([track({rotation_bin: 'M', request_flag: true})]))
			render(<LivePlaylist />)
			await flushPromises()

			const cell = screen
				.getByText('Juana Molina')
				.closest('tr')
				.querySelector('td')
			expect(cell.textContent).toContain('In rotation')
			expect(cell.textContent).toContain('Listener request')
		})

		it('leaves the column empty for a plain play', async () => {
			mockFetchOnce(
				envelope([track({rotation_bin: null, request_flag: false})])
			)
			render(<LivePlaylist />)
			await flushPromises()

			const cell = screen
				.getByText('Juana Molina')
				.closest('tr')
				.querySelector('td')
			expect(cell.textContent.trim()).toBe('')
		})

		it('omits the key when there is nothing to mark', async () => {
			mockFetchOnce(envelope([]))
			render(<LivePlaylist />)
			await flushPromises()

			expect(
				screen.queryByRole('list', {name: /what the marks mean/i})
			).toBeNull()
		})
	})
})
