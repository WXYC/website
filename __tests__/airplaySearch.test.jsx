import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {createMockFetch, createTestLifecycle, testData} from './test-utils'

vi.mock('next/head', () => ({
	default: ({children}) => <>{children}</>,
}))

const AirplaySearch = (await import('../pages/airplay-search')).default

const result = testData.flowsheetSearchResult

function mockFetchOnce(body, options) {
	global.fetch = createMockFetch(body, options)
	return global.fetch
}

const lifecycle = createTestLifecycle()

beforeEach(lifecycle.beforeEach)
afterEach(lifecycle.afterEach)

describe('Airplay search page', () => {
	it('shows a loading state before the first fetch resolves', () => {
		global.fetch = vi.fn(() => new Promise(() => {}))
		render(<AirplaySearch />)

		expect(screen.getByRole('status')).toBeDefined()
	})

	it('loads the recent-tracks default for an empty query, with no q param', async () => {
		const fetchMock = mockFetchOnce({
			results: [result()],
			total: 823,
			page: 0,
			totalPages: 33,
		})
		render(<AirplaySearch />)

		await waitFor(() => expect(fetchMock).toHaveBeenCalled())
		const url = new URL(fetchMock.mock.calls[0][0])
		expect(url.searchParams.has('q')).toBe(false)
		expect(url.searchParams.get('page')).toBe('0')
		expect(await screen.findByText('Juana Molina')).toBeDefined()
	})

	it('renders a results table with artist, track, album, label, play date, and DJ', async () => {
		mockFetchOnce({
			results: [result()],
			total: 1,
			page: 0,
			totalPages: 1,
		})
		render(<AirplaySearch />)

		await screen.findByText('Juana Molina')
		expect(screen.getByText('Quien? (Suite)')).toBeDefined()
		expect(screen.getByText('un dia')).toBeDefined()
		expect(screen.getByText('Domino')).toBeDefined()
		expect(screen.getByText('July 21, 2026, 11:47 AM')).toBeDefined()
		expect(screen.getByText('Unknown DJ')).toBeDefined()
	})

	it('renders a no-results message for a query with no matches, not a blank table', async () => {
		mockFetchOnce({results: [], total: 0, page: 0, totalPages: 0})
		render(<AirplaySearch />)

		expect(await screen.findByText(/no.*airplay/i)).toBeDefined()
		expect(screen.queryByRole('table')).toBeNull()
	})

	it('renders a fetch failure as an alert with a retry, not a blank table', async () => {
		mockFetchOnce(null, {ok: false, status: 503})
		render(<AirplaySearch />)

		const alert = await screen.findByRole('alert')
		expect(alert.textContent).toContain('503')
		expect(screen.getByRole('button', {name: 'Retry'})).toBeDefined()
		expect(screen.queryByRole('table')).toBeNull()
	})

	it('renders a 400 as guidance about the query rather than a blank table', async () => {
		mockFetchOnce(null, {ok: false, status: 400})
		render(<AirplaySearch />)

		const alert = await screen.findByRole('alert')
		expect(alert.textContent.toLowerCase()).toContain('query')
		expect(screen.queryByRole('table')).toBeNull()
	})

	it('debounces the search input rather than firing a request per keystroke', async () => {
		const fetchMock = mockFetchOnce({
			results: [],
			total: 0,
			page: 0,
			totalPages: 0,
		})
		render(<AirplaySearch />)
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		fetchMock.mockClear()

		const input = screen.getByRole('searchbox')
		fireEvent.change(input, {target: {value: 'j'}})
		fireEvent.change(input, {target: {value: 'ju'}})
		fireEvent.change(input, {target: {value: 'jua'}})
		fireEvent.change(input, {target: {value: 'juana'}})

		// Still inside the debounce window immediately after typing.
		expect(fetchMock).not.toHaveBeenCalled()

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), {
			timeout: 2000,
		})
		const url = new URL(fetchMock.mock.calls[0][0])
		expect(url.searchParams.get('q')).toBe('juana')
	})

	it('resets to page 0 when the query changes', async () => {
		const fetchMock = mockFetchOnce({
			results: Array.from({length: 25}, (_, i) => result({id: i})),
			total: 100,
			page: 0,
			totalPages: 4,
		})
		render(<AirplaySearch />)
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

		fireEvent.click(screen.getByRole('button', {name: /Next/}))
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
		expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('page')).toBe(
			'1'
		)

		fetchMock.mockClear()
		const input = screen.getByRole('searchbox')
		fireEvent.change(input, {target: {value: 'stereolab'}})

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), {
			timeout: 2000,
		})
		expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('page')).toBe(
			'0'
		)
	})

	it('paginates forward and back, bounded by totalPages', async () => {
		mockFetchOnce({
			results: [result()],
			total: 50,
			page: 0,
			totalPages: 2,
		})
		render(<AirplaySearch />)
		await screen.findByText('Juana Molina')

		const previous = screen.getByRole('button', {name: /Previous/})
		const next = screen.getByRole('button', {name: /Next/})
		expect(previous.disabled).toBe(true)
		expect(next.disabled).toBe(false)

		mockFetchOnce({
			results: [result({id: 2, artist_name: 'Stereolab'})],
			total: 50,
			page: 1,
			totalPages: 2,
		})
		fireEvent.click(next)

		await screen.findByText('Stereolab')
		expect(screen.getByRole('button', {name: /Next/}).disabled).toBe(true)
		expect(screen.getByRole('button', {name: /Previous/}).disabled).toBe(false)
	})

	it('sends no credentials', async () => {
		const fetchMock = mockFetchOnce({
			results: [],
			total: 0,
			page: 0,
			totalPages: 0,
		})
		render(<AirplaySearch />)

		await waitFor(() => expect(fetchMock).toHaveBeenCalled())
		expect(fetchMock.mock.calls[0][1].credentials).toBe('omit')
	})

	it('surfaces field-qualified search syntax rather than letting a colon silently confuse results', async () => {
		mockFetchOnce({results: [], total: 0, page: 0, totalPages: 0})
		render(<AirplaySearch />)

		expect(screen.getByText(/artist:/)).toBeDefined()
		await screen.findByText(/no airplay/i)
	})
})
