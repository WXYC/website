import {describe, it, expect} from 'vitest'
import {calculateTime} from '../lib/timeUtils'

describe('timeUtils', () => {
	describe('calculateTime', () => {
		it('formats 0 seconds as 00:00', () => {
			expect(calculateTime(0)).toBe('00:00')
		})

		it('adds leading zero for minutes under 10', () => {
			expect(calculateTime(60)).toBe('01:00')
			expect(calculateTime(540)).toBe('09:00')
		})

		it('adds leading zero for seconds under 10', () => {
			expect(calculateTime(5)).toBe('00:05')
			expect(calculateTime(65)).toBe('01:05')
		})

		it('formats 60 seconds as 01:00', () => {
			expect(calculateTime(60)).toBe('01:00')
		})

		it('formats 90 seconds as 01:30', () => {
			expect(calculateTime(90)).toBe('01:30')
		})

		it('handles values over 10 minutes without leading zero', () => {
			expect(calculateTime(600)).toBe('10:00')
			expect(calculateTime(3600)).toBe('60:00')
		})

		it('floors decimal seconds', () => {
			expect(calculateTime(5.7)).toBe('00:05')
			expect(calculateTime(65.9)).toBe('01:05')
		})

		it('handles large values', () => {
			expect(calculateTime(7200)).toBe('120:00')
			expect(calculateTime(3661)).toBe('61:01')
		})

		it('handles fractional minutes correctly', () => {
			expect(calculateTime(75)).toBe('01:15')
			expect(calculateTime(119)).toBe('01:59')
			expect(calculateTime(120)).toBe('02:00')
		})
	})
})
