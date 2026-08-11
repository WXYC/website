import {describe, it, expect, vi} from 'vitest'
import {
	MAX_RANGE_MS,
	UNATTRIBUTED_DJ_LABEL,
	UNKNOWN_DJ_LABEL,
	compareEntriesByAirOrderDesc,
	describeNonTrackEntry,
	fetchFlowsheetRange,
	formatShowTime,
	groupRangeByDay,
	isTrack,
} from '../lib/flowsheetRange'
import {easternMidnightEpoch} from '../lib/easternTime'
import {createMockFetch, testData} from './test-utils'

const WEEK = '2026-08-03' // Monday

const show = testData.flowsheetShow
const entry = testData.flowsheetTrack

describe('fetchFlowsheetRange', () => {
	it('requests a half-open Eastern window in epoch milliseconds', async () => {
		const fetchImpl = createMockFetch({shows: [], entries: []})
		await fetchFlowsheetRange(WEEK, 7, {fetchImpl})

		const url = new URL(fetchImpl.mock.calls[0][0])
		expect(url.pathname).toBe('/flowsheet/range')
		expect(Number(url.searchParams.get('start'))).toBe(
			easternMidnightEpoch('2026-08-03')
		)
		expect(Number(url.searchParams.get('end'))).toBe(
			easternMidnightEpoch('2026-08-10')
		)
	})

	it('sends no credentials', async () => {
		const fetchImpl = createMockFetch({shows: [], entries: []})
		await fetchFlowsheetRange(WEEK, 7, {fetchImpl})

		expect(fetchImpl.mock.calls[0][1].credentials).toBe('omit')
	})

	it.each([
		['2024-10-28', 'fall-back'], // 7d + 1h
		['2024-03-04', 'spring-forward'], // 7d - 1h
	])('stays inside the 8-day ceiling on the %s week (%s)', async (week) => {
		const fetchImpl = createMockFetch({shows: [], entries: []})
		await fetchFlowsheetRange(week, 7, {fetchImpl})

		const url = new URL(fetchImpl.mock.calls[0][0])
		const span =
			Number(url.searchParams.get('end')) -
			Number(url.searchParams.get('start'))
		expect(span).toBeLessThanOrEqual(MAX_RANGE_MS)
		expect(span).toBeGreaterThan(0)
	})

	it('refuses an over-long window client-side rather than earning a 400', async () => {
		const fetchImpl = createMockFetch({shows: [], entries: []})

		await expect(fetchFlowsheetRange(WEEK, 30, {fetchImpl})).rejects.toThrow(
			/exceeds the 8-day maximum/
		)
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	it('translates a 400 into a message about the date range', async () => {
		const fetchImpl = createMockFetch(null, {ok: false, status: 400})

		await expect(fetchFlowsheetRange(WEEK, 7, {fetchImpl})).rejects.toThrow(
			/different week/
		)
	})

	it('surfaces the status on any other failure', async () => {
		const fetchImpl = createMockFetch(null, {ok: false, status: 503})

		await expect(fetchFlowsheetRange(WEEK, 7, {fetchImpl})).rejects.toThrow(
			/\(503\)/
		)
	})

	it('passes the abort signal through', async () => {
		const fetchImpl = createMockFetch({shows: [], entries: []})
		const controller = new AbortController()
		await fetchFlowsheetRange(WEEK, 7, {
			fetchImpl,
			signal: controller.signal,
		})

		expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal)
	})
})

describe('groupRangeByDay', () => {
	it('returns one element per day, in order, including empty days', () => {
		const result = groupRangeByDay({shows: [], entries: []}, WEEK, 7)

		expect(result.map((d) => d.date)).toEqual([
			'2026-08-03',
			'2026-08-04',
			'2026-08-05',
			'2026-08-06',
			'2026-08-07',
			'2026-08-08',
			'2026-08-09',
		])
		expect(result.every((d) => d.shows.length === 0)).toBe(true)
	})

	it('files each show under the Eastern date it started on', () => {
		const result = groupRangeByDay(
			{
				shows: [
					show({id: 1, start_time: '2026-08-03T14:00:00.000Z'}), // Mon 10 AM ET
					show({
						id: 2,
						dj_name: 'DJ Weird Fish',
						start_time: '2026-08-06T01:00:00.000Z', // Wed 9 PM ET
					}),
				],
				entries: [entry({id: 1, show_id: 1}), entry({id: 2, show_id: 2})],
			},
			WEEK,
			7
		)

		const byDate = Object.fromEntries(result.map((d) => [d.date, d.shows]))
		expect(byDate['2026-08-03'].map((s) => s.id)).toEqual([1])
		expect(byDate['2026-08-05'].map((s) => s.id)).toEqual([2])
	})

	it('keeps an overnight show whole rather than splitting it at midnight', () => {
		// Signs on 9 PM Wednesday ET, plays a track at 12:30 AM Thursday ET.
		const result = groupRangeByDay(
			{
				shows: [show({id: 7, start_time: '2026-08-06T01:00:00.000Z'})],
				entries: [
					entry({id: 1, show_id: 7, add_time: '2026-08-06T01:30:00.000Z'}),
					entry({id: 2, show_id: 7, add_time: '2026-08-06T04:30:00.000Z'}),
				],
			},
			WEEK,
			7
		)

		const wednesday = result.find((d) => d.date === '2026-08-05')
		expect(wednesday.shows).toHaveLength(1)
		expect(wednesday.shows[0].entries.map((e) => e.id)).toEqual([1, 2])
		expect(result.find((d) => d.date === '2026-08-06').shows).toHaveLength(0)
	})

	it('renders an entry with a null show_id as unattributed rather than dropping it', () => {
		// 20 of 2,619,011 production rows are in this state and will never be
		// backfilled.
		const result = groupRangeByDay(
			{
				shows: [show({id: 1})],
				entries: [
					entry({id: 1, show_id: 1}),
					entry({
						id: 2,
						show_id: null,
						artist_name: 'Nilüfer Yanya',
						add_time: '2026-08-03T20:00:00.000Z',
					}),
				],
			},
			WEEK,
			7
		)

		const monday = result.find((d) => d.date === '2026-08-03')
		const unattributed = monday.shows.find((s) => s.id === null)
		expect(unattributed).toBeDefined()
		expect(unattributed.djName).toBe(UNATTRIBUTED_DJ_LABEL)
		expect(unattributed.entries.map((e) => e.id)).toEqual([2])
	})

	it('routes an entry whose show is absent from the window to the same block', () => {
		// Defence only: `getShowsInTimeWindow` selects every show an in-window
		// entry references, so a correct Backend cannot produce this. Kept so a
		// contract regression loses no playlist history.
		const result = groupRangeByDay(
			{
				shows: [show({id: 1})],
				entries: [entry({id: 1, show_id: 1}), entry({id: 2, show_id: 999})],
			},
			WEEK,
			7
		)

		const monday = result.find((d) => d.date === '2026-08-03')
		expect(
			monday.shows.find((s) => s.id === null).entries.map((e) => e.id)
		).toEqual([2])
	})

	it('orders a show by play_order rather than by when rows arrived', () => {
		// A DJ who forgets the 1 PM and 2 PM breakpoints and enters them both at
		// 2:54 PM produces exactly this: play_order 2 and 3 arriving after
		// play_order 18. Production has 88 such inversions across 36 of the 54
		// shows in a sampled week.
		const result = groupRangeByDay(
			{
				shows: [show({id: 1})],
				entries: [
					entry({id: 1, play_order: 18, add_time: '2026-08-03T18:54:26.000Z'}),
					entry({
						id: 2,
						play_order: 2,
						entry_type: 'breakpoint',
						message: '--- 1:00 PM BREAKPOINT ---',
						add_time: '2026-08-03T18:54:38.000Z',
					}),
					entry({
						id: 3,
						play_order: 3,
						entry_type: 'breakpoint',
						message: '--- 2:00 PM BREAKPOINT ---',
						add_time: '2026-08-03T18:54:44.000Z',
					}),
					entry({id: 4, play_order: 19, add_time: '2026-08-03T19:02:49.000Z'}),
				],
			},
			WEEK,
			7
		)

		const monday = result.find((d) => d.date === '2026-08-03')
		expect(monday.shows[0].entries.map((e) => e.id)).toEqual([2, 3, 1, 4])
	})

	it('files a show that started outside the window by the day its entries aired', () => {
		// Production case: a breakpoint filed against show 72379, whose start_time
		// is a week and a half after the entry's add_time. Filing by start date is
		// impossible, and filing everything on the window's first day renders the
		// show on a date it did not air, labelled with times from another one.
		const result = groupRangeByDay(
			{
				shows: [
					show({id: 1}),
					show({
						id: 72379,
						dj_name: 'Aubrey Hearst',
						start_time: '2026-08-19T23:00:32.000Z',
						end_time: '2026-08-20T00:58:03.000Z',
					}),
				],
				entries: [
					entry({id: 1, show_id: 1}),
					entry({
						id: 2,
						show_id: 72379,
						entry_type: 'breakpoint',
						message: '--- 7:00 PM BREAKPOINT ---',
						add_time: '2026-08-05T23:00:00.000Z', // Wed 7 PM ET
					}),
				],
			},
			WEEK,
			7
		)

		const byDate = Object.fromEntries(result.map((d) => [d.date, d.shows]))
		expect(byDate['2026-08-05'].map((s) => s.id)).toEqual([72379])
		expect(byDate['2026-08-03'].map((s) => s.id)).toEqual([1])
	})

	it('orders a day by when each block first went to air', () => {
		// An unattributed run is built after the shows are, so appending it would
		// put an 8 AM entry below a show that signed on at 11 PM.
		const result = groupRangeByDay(
			{
				shows: [show({id: 1, start_time: '2026-08-04T03:00:00.000Z'})], // Mon 11 PM ET
				entries: [
					entry({id: 1, show_id: 1, add_time: '2026-08-04T03:05:00.000Z'}),
					entry({id: 2, show_id: null, add_time: '2026-08-03T12:00:00.000Z'}), // Mon 8 AM ET
				],
			},
			WEEK,
			7
		)

		const monday = result.find((d) => d.date === '2026-08-03')
		expect(monday.shows.map((s) => s.id)).toEqual([null, 1])
	})

	it('keeps unattributed runs on different days separate', () => {
		const result = groupRangeByDay(
			{
				shows: [],
				entries: [
					entry({id: 1, show_id: null, add_time: '2026-08-03T20:00:00.000Z'}),
					entry({id: 2, show_id: null, add_time: '2026-08-05T20:00:00.000Z'}),
				],
			},
			WEEK,
			7
		)

		expect(
			result
				.find((d) => d.date === '2026-08-03')
				.shows[0].entries.map((e) => e.id)
		).toEqual([1])
		expect(
			result
				.find((d) => d.date === '2026-08-05')
				.shows[0].entries.map((e) => e.id)
		).toEqual([2])
	})

	it('hides a show that contributed no entries to the window', () => {
		// The range endpoint returns shows by overlap, so a show whose entries all
		// fall outside the window comes back with an empty block. Rendering an
		// empty header would be noise.
		const result = groupRangeByDay(
			{shows: [show({id: 1})], entries: []},
			WEEK,
			7
		)

		expect(result.every((d) => d.shows.length === 0)).toBe(true)
	})

	it('labels a show with no dj_name distinctly from the unattributed block', () => {
		// dj_name is nullable by contract, so a genuine show can arrive without a
		// handle. That is a different fact from "these rows belong to no show".
		const result = groupRangeByDay(
			{
				shows: [show({id: 1, dj_name: null})],
				entries: [entry({id: 1, show_id: 1}), entry({id: 2, show_id: null})],
			},
			WEEK,
			7
		)

		const monday = result.find((d) => d.date === '2026-08-03')
		expect(monday.shows[0].djName).toBe(UNKNOWN_DJ_LABEL)
		expect(monday.shows[1].djName).toBe(UNATTRIBUTED_DJ_LABEL)
		expect(UNKNOWN_DJ_LABEL).not.toBe(UNATTRIBUTED_DJ_LABEL)
	})

	it('tolerates a missing or empty response body', () => {
		expect(groupRangeByDay(undefined, WEEK, 7)).toHaveLength(7)
		expect(groupRangeByDay({}, WEEK, 7)).toHaveLength(7)
	})
})

describe('formatShowTime', () => {
	it('renders a start and end time', () => {
		expect(
			formatShowTime({
				startTime: '2026-08-05T05:09:04.077Z',
				endTime: '2026-08-05T06:31:59.767Z',
			})
		).toBe('1:09 AM – 2:31 AM')
	})

	it('renders only the start when end_time is null', () => {
		// Null end_time means "on the air" OR "sign-off was never recorded", and
		// the two are indistinguishable, so the page claims neither.
		expect(
			formatShowTime({startTime: '2026-08-05T05:09:04.077Z', endTime: null})
		).toBe('1:09 AM')
	})

	it('renders nothing when the start is unknown', () => {
		expect(formatShowTime({startTime: null, endTime: null})).toBe('')
	})
})

describe('isTrack', () => {
	it.each([
		['track', true],
		['talkset', false],
		['breakpoint', false],
		['show_start', false],
		['show_end', false],
	])('classifies %s as track=%s', (entryType, expected) => {
		expect(isTrack({entry_type: entryType})).toBe(expected)
	})
})

describe('groupRangeByDay: delimiter handling', () => {
	it('drops show_start / show_end rather than repeating the show header', () => {
		const result = groupRangeByDay(
			{
				shows: [show({id: 1})],
				entries: [
					{
						id: 1,
						show_id: 1,
						play_order: 1,
						add_time: '2026-08-03T14:00:00.000Z',
						entry_type: 'show_start',
					},
					entry({id: 2}),
					{
						id: 3,
						show_id: 1,
						play_order: 3,
						add_time: '2026-08-03T17:00:00.000Z',
						entry_type: 'show_end',
					},
				],
			},
			WEEK,
			7
		)

		const monday = result.find((d) => d.date === '2026-08-03')
		expect(monday.shows[0].entries.map((e) => e.id)).toEqual([2])
	})

	it('drops a show whose only rows were its own delimiters', () => {
		// Production runs one to three of these sign-on/sign-off shells a week.
		const result = groupRangeByDay(
			{
				shows: [show({id: 1, dj_name: 'Funland Research'})],
				entries: [
					{
						id: 1,
						show_id: 1,
						play_order: 1,
						add_time: '2026-08-03T14:00:00.000Z',
						entry_type: 'show_start',
					},
					{
						id: 2,
						show_id: 1,
						play_order: 2,
						add_time: '2026-08-03T14:02:00.000Z',
						entry_type: 'show_end',
					},
				],
			},
			WEEK,
			7
		)

		expect(result.every((d) => d.shows.length === 0)).toBe(true)
	})

	it('keeps a show that aired talk but no tracks', () => {
		// A talk-only show is still a show with something to read.
		const result = groupRangeByDay(
			{
				shows: [show({id: 1})],
				entries: [
					{
						id: 1,
						show_id: 1,
						play_order: 1,
						add_time: '2026-08-03T14:00:00.000Z',
						entry_type: 'talkset',
						message: 'TALKSET',
					},
				],
			},
			WEEK,
			7
		)

		const monday = result.find((d) => d.date === '2026-08-03')
		expect(monday.shows).toHaveLength(1)
		expect(monday.shows[0].entries).toHaveLength(1)
	})
})

describe('entry_type coverage', () => {
	// api.yaml's FlowsheetEntryType enum, in full. An omission here is silent:
	// the row simply never appears on the page.
	const DECLARED = [
		'track',
		'show_start',
		'show_end',
		'dj_join',
		'dj_leave',
		'talkset',
		'breakpoint',
		'message',
	]

	it.each(DECLARED.filter((t) => !t.startsWith('show_')))(
		'keeps %s, which is real air content',
		(entryType) => {
			const result = groupRangeByDay(
				{
					shows: [show({id: 1})],
					entries: [entry({id: 1, show_id: 1, entry_type: entryType})],
				},
				WEEK,
				7
			)

			expect(
				result.find((d) => d.date === '2026-08-03').shows[0].entries
			).toHaveLength(1)
		}
	)

	it('keeps a guest DJ joining mid-set', () => {
		// dj_join / dj_leave only occur when a guest DJ joins, so a single sampled
		// day usually holds none while five sampled production weeks hold 25.
		const result = groupRangeByDay(
			{
				shows: [show({id: 1})],
				entries: [
					entry({id: 1, show_id: 1}),
					{
						id: 2,
						show_id: 1,
						play_order: 2,
						add_time: '2026-08-03T14:31:58.258Z',
						entry_type: 'dj_join',
						dj_name: 'DJ will',
					},
				],
			},
			WEEK,
			7
		)

		const monday = result.find((d) => d.date === '2026-08-03')
		expect(monday.shows[0].entries.map((e) => e.id)).toEqual([1, 2])
	})
})

describe('describeNonTrackEntry', () => {
	it.each([
		['dj_join', 'DJ will', 'DJ will joined'],
		['dj_leave', 'DJ will', 'DJ will left'],
		['dj_join', null, 'DJ joined'],
		['dj_leave', null, 'DJ left'],
	])(
		'renders a %s row from dj_name, which carries no message',
		(entryType, djName, expected) => {
			expect(
				describeNonTrackEntry({
					entry_type: entryType,
					message: null,
					dj_name: djName,
				})
			).toBe(expected)
		}
	)

	it('prefers the message when there is one', () => {
		expect(
			describeNonTrackEntry({entry_type: 'talkset', message: 'TALKSET'})
		).toBe('TALKSET')
	})

	it('falls back to a readable type name', () => {
		expect(
			describeNonTrackEntry({entry_type: 'some_future_type', message: null})
		).toBe('some future type')
	})
})

describe('compareEntriesByAirOrderDesc', () => {
	it('sorts the most recent show first', () => {
		const older = {show_id: 1, play_order: 1, id: 1}
		const newer = {show_id: 2, play_order: 1, id: 2}
		expect([older, newer].sort(compareEntriesByAirOrderDesc)).toEqual([
			newer,
			older,
		])
	})

	it('within a show, sorts by play_order — the DJ-stated air order — descending', () => {
		const earlier = {show_id: 1, play_order: 1, id: 10}
		const later = {show_id: 1, play_order: 2, id: 11}
		expect([earlier, later].sort(compareEntriesByAirOrderDesc)).toEqual([
			later,
			earlier,
		])
	})

	it('breaks a play_order collision on id, newest first', () => {
		// play_order collisions are real: the tubafrenzy webhook and the
		// dj-site live-insert path assign it independently and there is no
		// per-show UNIQUE constraint, so two rows can legitimately share one
		// number. Backend's own `getEntriesByShow` breaks the same tie on
		// `desc(id)`.
		const insertedFirst = {show_id: 1, play_order: 5, id: 100}
		const insertedSecond = {show_id: 1, play_order: 5, id: 101}
		expect(
			[insertedFirst, insertedSecond].sort(compareEntriesByAirOrderDesc)
		).toEqual([insertedSecond, insertedFirst])
	})

	it('does not rely on Array.prototype.sort stability for a play_order collision', () => {
		// A comparator that omitted the id tie-break and returned 0 for a
		// collision would depend on sort stability to preserve arrival order —
		// which is exactly the ordering a play_order sort exists to override.
		// Feeding the collided pair in through both possible arrival orders and
		// requiring the same output either way catches that regression.
		const a = {show_id: 1, play_order: 5, id: 100}
		const b = {show_id: 1, play_order: 5, id: 101}
		expect([a, b].sort(compareEntriesByAirOrderDesc)).toEqual([b, a])
		expect([b, a].sort(compareEntriesByAirOrderDesc)).toEqual([b, a])
	})

	it('treats a null show_id as sorting after any real show, without producing NaN', () => {
		const unattributed = {show_id: null, play_order: 1, id: 1}
		const attributed = {show_id: 1, play_order: 1, id: 2}
		expect(
			[unattributed, attributed].sort(compareEntriesByAirOrderDesc)
		).toEqual([attributed, unattributed])
	})

	it('compares two null-show_id rows to a real number rather than NaN', () => {
		const a = {show_id: null, play_order: 2, id: 1}
		const b = {show_id: null, play_order: 1, id: 2}
		expect(Number.isNaN(compareEntriesByAirOrderDesc(a, b))).toBe(false)
		expect([a, b].sort(compareEntriesByAirOrderDesc)).toEqual([a, b])
	})
})
