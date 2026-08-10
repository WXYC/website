import {describe, it, expect, vi} from 'vitest'
import {
	MAX_RANGE_MS,
	UNATTRIBUTED_DJ_LABEL,
	UNKNOWN_DJ_LABEL,
	describeNonTrackEntry,
	fetchFlowsheetRange,
	formatShowTime,
	groupRangeByDay,
	isTrack,
} from '../lib/flowsheetRange'
import {easternMidnightEpoch} from '../lib/easternTime'
import {createMockFetch} from './test-utils'

const WEEK = '2026-08-03' // Monday

function show(overrides = {}) {
	return {
		id: 1,
		dj_name: 'DJ Biscuit',
		show_name: null,
		specialty_id: null,
		start_time: '2026-08-03T14:00:00.000Z', // 10 AM ET Monday
		end_time: '2026-08-03T17:00:00.000Z',
		...overrides,
	}
}

function entry(overrides = {}) {
	return {
		id: 100,
		show_id: 1,
		play_order: 1,
		add_time: '2026-08-03T14:05:00.000Z',
		entry_type: 'track',
		artist_name: 'Juana Molina',
		track_title: 'la paradoja',
		album_title: 'DOGA',
		record_label: 'Sonamos',
		request_flag: false,
		...overrides,
	}
}

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
		// The endpoint selects shows by overlap and does not treat a null
		// end_time as open-ended, so a show that started before the window and
		// never signed off is excluded while its entries are not.
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
