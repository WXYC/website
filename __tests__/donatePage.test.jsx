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
		// App Store Review Guideline 3.2.1 requires the linked page to say what
		// the money does. Bind all three terms to the one use-of-funds paragraph
		// so the assertion cannot be satisfied by the words turning up
		// incidentally elsewhere on the page.
		const useOfFunds = screen.getByText(/Your donation supports/)
		expect(useOfFunds.textContent).toMatch(/equipment/)
		expect(useOfFunds.textContent).toMatch(/music library/)
		expect(useOfFunds.textContent).toMatch(/broadcasting/)
	})

	it('keeps the disclosure adjacent to the ask, in matching type size', () => {
		render(<Donate />)
		const ask = screen.getByText(/Please consider making a gift/)
		const disclosure = screen.getByText(
			/is not a 501\(c\)\(3\) tax-exempt organization/
		)
		// Federal safe-harbor placement: the disclosure sits immediately after the
		// ask, so nothing — least of all a future payment embed — can be wedged
		// between them.
		expect(disclosure.previousElementSibling).toBe(ask)
		// ...and at the same type size. Both are unstyled <p> inside the same
		// `prose prose-lg` block; a divergent class on either (say `text-sm` on
		// the disclosure) would break the safe harbor.
		expect(disclosure.tagName).toBe(ask.tagName)
		expect(disclosure.className).toBe(ask.className)
	})

	it('renders no payment affordance until the SEB board picks a platform', () => {
		const {container} = render(<Donate />)
		// A payment path can arrive as a button, a form post, a hosted-checkout
		// iframe, or a bare link to a processor — querying the `button` role
		// alone would wave the last three straight through.
		expect(container.querySelector('button, form, iframe')).toBeNull()
		const offsiteLinks = Array.from(container.querySelectorAll('a[href]'))
			.map((a) => a.getAttribute('href'))
			.filter((href) => !href.startsWith('/'))
		expect(offsiteLinks).toEqual([])
	})
})
