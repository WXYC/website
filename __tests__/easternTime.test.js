import {describe, it, expect} from 'vitest'
import {
	EARLIEST_ARCHIVE_DATE,
	clampWeekToArchive,
	addDays,
	easternDateOf,
	easternMidnightEpoch,
	easternToday,
	formatCalendarDate,
	formatEasternTime,
	startOfWeek,
} from '../lib/easternTime'

describe('easternMidnightEpoch', () => {
	it.each([
		['2024-01-15', '2024-01-15T05:00:00.000Z'], // EST, UTC-5
		['2024-07-15', '2024-07-15T04:00:00.000Z'], // EDT, UTC-4
		['2024-03-10', '2024-03-10T05:00:00.000Z'], // spring-forward day starts EST
		['2024-03-11', '2024-03-11T04:00:00.000Z'], // the day after starts EDT
		['2024-11-03', '2024-11-03T04:00:00.000Z'], // fall-back day starts EDT
		['2024-11-04', '2024-11-04T05:00:00.000Z'], // the day after starts EST
	])('resolves midnight Eastern on %s to %s', (date, expected) => {
		expect(new Date(easternMidnightEpoch(date)).toISOString()).toBe(expected)
	})

	it('yields a 23-hour spring-forward day', () => {
		const start = easternMidnightEpoch('2024-03-10')
		const end = easternMidnightEpoch('2024-03-11')
		expect(end - start).toBe(23 * 60 * 60 * 1000)
	})

	it('yields a 25-hour fall-back day', () => {
		const start = easternMidnightEpoch('2024-11-03')
		const end = easternMidnightEpoch('2024-11-04')
		expect(end - start).toBe(25 * 60 * 60 * 1000)
	})

	it('yields a 7-day-and-1-hour week across the fall-back transition', () => {
		// This is why Backend's ceiling is 8 days rather than exactly 7: a
		// calendar week can be longer than 168 hours.
		const start = easternMidnightEpoch('2024-10-28')
		const end = easternMidnightEpoch('2024-11-04')
		expect(end - start).toBe(7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000)
	})

	it('yields a 7-day-minus-1-hour week across the spring-forward transition', () => {
		const start = easternMidnightEpoch('2024-03-04')
		const end = easternMidnightEpoch('2024-03-11')
		expect(end - start).toBe(7 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000)
	})
})

describe('addDays', () => {
	it.each([
		['2024-03-27', 1, '2024-03-28'],
		['2024-03-10', 1, '2024-03-11'], // spring forward
		['2024-11-03', 1, '2024-11-04'], // fall back
		['2024-01-31', 1, '2024-02-01'], // month rollover
		['2024-02-28', 1, '2024-02-29'], // leap day
		['2023-02-28', 1, '2023-03-01'], // non-leap year
		['2024-12-31', 1, '2025-01-01'], // year rollover
		['2024-01-01', -1, '2023-12-31'], // backwards across a year
		['2024-08-05', 7, '2024-08-12'],
		['2024-08-05', -7, '2024-07-29'],
	])('shifts %s by %i days to %s', (date, days, expected) => {
		expect(addDays(date, days)).toBe(expected)
	})
})

describe('startOfWeek', () => {
	it.each([
		['2026-08-10', '2026-08-10'], // a Monday maps to itself
		['2026-08-11', '2026-08-10'], // Tuesday
		['2026-08-15', '2026-08-10'], // Saturday
		['2026-08-16', '2026-08-10'], // Sunday belongs to the week that began Monday
		['2026-08-17', '2026-08-17'], // the next Monday
	])('maps %s to the week of %s', (date, expected) => {
		expect(startOfWeek(date)).toBe(expected)
	})

	it('walks backwards across a month boundary', () => {
		expect(startOfWeek('2026-09-02')).toBe('2026-08-31')
	})

	it('is idempotent', () => {
		const once = startOfWeek('2026-08-15')
		expect(startOfWeek(once)).toBe(once)
	})
})

describe('easternToday', () => {
	it('reports the Eastern calendar date, not the UTC one', () => {
		// 03:30 UTC on the 6th is 11:30 PM Eastern on the 5th.
		expect(easternToday(new Date('2026-08-06T03:30:00Z'))).toBe('2026-08-05')
	})

	it('rolls over at midnight Eastern', () => {
		expect(easternToday(new Date('2026-08-06T04:00:00Z'))).toBe('2026-08-06')
	})
})

describe('easternDateOf', () => {
	it('buckets a late-evening instant onto the Eastern day it aired', () => {
		expect(easternDateOf('2026-08-06T03:06:41.391Z')).toBe('2026-08-05')
	})

	it('returns null for an unparseable timestamp', () => {
		expect(easternDateOf('not a timestamp')).toBeNull()
	})
})

describe('formatEasternTime', () => {
	it('renders an instant as an Eastern clock time', () => {
		expect(formatEasternTime('2026-08-05T05:09:04.077Z')).toBe('1:09 AM')
	})

	it('returns the empty string for an unparseable timestamp', () => {
		expect(formatEasternTime(undefined)).toBe('')
	})
})

describe('formatCalendarDate', () => {
	it('renders a calendar date without shifting it', () => {
		expect(formatCalendarDate('2026-08-05')).toBe('Wednesday, August 5, 2026')
	})

	it('honours option overrides', () => {
		expect(formatCalendarDate('2026-08-05', {weekday: undefined})).toBe(
			'August 5, 2026'
		)
	})
})

describe('clampWeekToArchive', () => {
	const TODAY = '2026-08-10' // a Monday

	it('snaps a date inside the archive to its Monday', () => {
		expect(clampWeekToArchive('2026-08-05', TODAY)).toBe('2026-08-03')
	})

	it.each([
		['before the archive begins', '1970-01-05'],
		// `<input type="date">` reports each keystroke of a typed year, so editing
		// the field to 2026 emits 0002, 0020 and 0202 along the way.
		['a partially-typed year', '0202-08-10'],
	])('clamps %s to the first archived week', (_label, date) => {
		expect(clampWeekToArchive(date, TODAY)).toBe(
			startOfWeek(EARLIEST_ARCHIVE_DATE)
		)
	})

	it('clamps a future date to the current week', () => {
		expect(clampWeekToArchive('2099-01-01', TODAY)).toBe('2026-08-10')
	})

	it('leaves the current week alone', () => {
		expect(clampWeekToArchive(TODAY, TODAY)).toBe('2026-08-10')
	})
})
