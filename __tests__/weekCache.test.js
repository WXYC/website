import {describe, it, expect, beforeEach} from 'vitest'
import {clearWeekCache, getCachedWeek, setCachedWeek} from '../lib/weekCache'

const CURRENT = '2026-08-10'

describe('weekCache', () => {
	beforeEach(clearWeekCache)

	it('returns a week it was given', () => {
		setCachedWeek('2026-08-03', ['days'], CURRENT)
		expect(getCachedWeek('2026-08-03')).toEqual(['days'])
	})

	it('returns undefined for a week it has never seen', () => {
		expect(getCachedWeek('2026-08-03')).toBeUndefined()
	})

	it('refuses to hold the week in progress', () => {
		// It is still being written to as shows air.
		setCachedWeek(CURRENT, ['stale'], CURRENT)
		expect(getCachedWeek(CURRENT)).toBeUndefined()
	})

	it('evicts the least recently used week past the limit', () => {
		const weeks = Array.from({length: 9}, (_, i) => `2025-0${i + 1}-01`)
		for (const week of weeks) setCachedWeek(week, week, CURRENT)

		expect(getCachedWeek(weeks[0])).toBeUndefined()
		expect(getCachedWeek(weeks[8])).toBe(weeks[8])
	})

	it('keeps a week that was read again recently', () => {
		const weeks = Array.from({length: 8}, (_, i) => `2025-0${i + 1}-01`)
		for (const week of weeks) setCachedWeek(week, week, CURRENT)

		// Touch the oldest, then overflow by one.
		setCachedWeek(weeks[0], weeks[0], CURRENT)
		setCachedWeek('2025-09-01', 'new', CURRENT)

		expect(getCachedWeek(weeks[0])).toBe(weeks[0])
		expect(getCachedWeek(weeks[1])).toBeUndefined()
	})
})
