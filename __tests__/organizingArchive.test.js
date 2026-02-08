import {describe, it, expect} from 'vitest'
import {
	groupEventsByWeek,
	generateStructuredData,
} from '../components/OrganizingArchive'

describe('OrganizingArchive', () => {
	describe('groupEventsByWeek', () => {
		it('returns empty object for empty array', () => {
			const result = groupEventsByWeek([])
			expect(Object.keys(result)).toHaveLength(0)
		})

		it('groups events from the same week together', () => {
			// All days in the same week (Mon-Wed of the same week)
			const events = [
				{node: {published: '2024-01-15', title: 'Monday Event'}},
				{node: {published: '2024-01-16', title: 'Tuesday Event'}},
				{node: {published: '2024-01-17', title: 'Wednesday Event'}},
			]
			const result = groupEventsByWeek(events)
			const keys = Object.keys(result)
			expect(keys).toHaveLength(1)
			expect(result[keys[0]]).toHaveLength(3)
		})

		it('separates events from different weeks', () => {
			const events = [
				{node: {published: '2024-01-15', title: 'Week 1'}}, // Mon Jan 15
				{node: {published: '2024-01-22', title: 'Week 2'}}, // Mon Jan 22
			]
			const result = groupEventsByWeek(events)
			expect(Object.keys(result)).toHaveLength(2)
		})

		it('uses Sunday as week start', () => {
			// Events on Mon Jan 15 and Sun Jan 21 should be in different weeks
			// Jan 15 (Mon) -> week starts Jan 14 (Sun)
			// Jan 21 (Sun) -> week starts Jan 21 (Sun)
			const events = [
				{node: {published: '2024-01-15T12:00:00', title: 'Monday Jan 15'}},
				{node: {published: '2024-01-21T12:00:00', title: 'Sunday Jan 21'}},
			]
			const result = groupEventsByWeek(events)
			const keys = Object.keys(result)
			expect(keys).toHaveLength(2)
			expect(keys).toContain('2024-01-14') // Week starting Sun Jan 14
			expect(keys).toContain('2024-01-21') // Week starting Sun Jan 21
		})

		it('uses ISO date format for keys', () => {
			const events = [{node: {published: '2024-01-15', title: 'Event'}}]
			const result = groupEventsByWeek(events)
			const key = Object.keys(result)[0]
			expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
		})

		it('calculates correct week start date', () => {
			// Wed Jan 17 should have week start of Sun Jan 14
			const events = [{node: {published: '2024-01-17', title: 'Wednesday'}}]
			const result = groupEventsByWeek(events)
			expect(Object.keys(result)).toContain('2024-01-14')
		})

		it('handles week boundary correctly', () => {
			// Sun Jan 14 is start of week, Sat Jan 20 is end of same week
			const events = [
				{node: {published: '2024-01-14T12:00:00', title: 'Sunday'}},
				{node: {published: '2024-01-20T12:00:00', title: 'Saturday'}},
			]
			const result = groupEventsByWeek(events)
			expect(Object.keys(result)).toHaveLength(1)
			expect(Object.keys(result)).toContain('2024-01-14')
		})

		it('extracts node data from events', () => {
			const events = [
				{
					node: {
						published: '2024-01-15',
						title: 'Test Event',
						description: 'A description',
					},
				},
			]
			const result = groupEventsByWeek(events)
			const weekKey = Object.keys(result)[0]
			expect(result[weekKey][0]).toEqual({
				published: '2024-01-15',
				title: 'Test Event',
				description: 'A description',
			})
		})
	})

	describe('generateStructuredData', () => {
		it('returns empty array for empty input', () => {
			const result = generateStructuredData({})
			expect(result).toHaveLength(0)
		})

		it('generates heading and events for each week', () => {
			const groupedEvents = {
				'2024-01-14': [{title: 'Event 1'}, {title: 'Event 2'}],
			}
			const result = generateStructuredData(groupedEvents)
			expect(result).toHaveLength(2)
			expect(result[0]).toEqual({type: 'heading', weekStartDate: '2024-01-14'})
			expect(result[1]).toEqual({
				type: 'events',
				weekEvents: [
					{type: 'event', event: {title: 'Event 1'}},
					{type: 'event', event: {title: 'Event 2'}},
				],
			})
		})

		it('handles multiple weeks', () => {
			const groupedEvents = {
				'2024-01-14': [{title: 'Week 1 Event'}],
				'2024-01-21': [{title: 'Week 2 Event'}],
			}
			const result = generateStructuredData(groupedEvents)
			// Should have 2 headings + 2 event blocks = 4 items
			expect(result).toHaveLength(4)
			expect(result.filter((item) => item.type === 'heading')).toHaveLength(2)
			expect(result.filter((item) => item.type === 'events')).toHaveLength(2)
		})

		it('preserves week order from input object', () => {
			const groupedEvents = {
				'2024-01-14': [{title: 'First'}],
				'2024-01-21': [{title: 'Second'}],
			}
			const result = generateStructuredData(groupedEvents)
			const headings = result.filter((item) => item.type === 'heading')
			expect(headings[0].weekStartDate).toBe('2024-01-14')
			expect(headings[1].weekStartDate).toBe('2024-01-21')
		})

		it('wraps each event with type: event', () => {
			const groupedEvents = {
				'2024-01-14': [{title: 'Event', id: 1}],
			}
			const result = generateStructuredData(groupedEvents)
			const eventsBlock = result.find((item) => item.type === 'events')
			expect(eventsBlock.weekEvents[0]).toEqual({
				type: 'event',
				event: {title: 'Event', id: 1},
			})
		})
	})
})
