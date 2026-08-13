import {describe, it, expect, vi, afterEach} from 'vitest'
import {render, screen, cleanup} from '@testing-library/react'

vi.mock('next/head', () => ({
	default: ({children}) => <>{children}</>,
}))

const Donate = (await import('../pages/donate')).default

describe('Donate page', () => {
	afterEach(() => cleanup())

	it('carries the federal safe-harbor non-deductibility statement', () => {
		render(<Donate />)
		expect(
			screen.getByText(/is not a 501\(c\)\(3\) tax-exempt organization/)
		).toBeDefined()
		expect(
			screen.getByText(
				/Contributions are not deductible as charitable contributions for federal income tax purposes/
			)
		).toBeDefined()
	})

	it('names Student Educational Broadcasting, Inc. as the soliciting organization, not UNC', () => {
		render(<Donate />)
		expect(
			screen.getAllByText(/Student Educational Broadcasting, Inc\./).length
		).toBeGreaterThan(0)
		expect(
			screen.getByText(/not to the University of North Carolina at Chapel Hill/)
		).toBeDefined()
	})

	it('discloses how funds are used', () => {
		render(<Donate />)
		expect(screen.getByText(/equipment/)).toBeDefined()
		expect(screen.getByText(/music library/)).toBeDefined()
		expect(screen.getByText(/broadcasting/)).toBeDefined()
	})

	it('does not render a payment button', () => {
		render(<Donate />)
		expect(screen.queryByRole('button')).toBeNull()
	})
})
