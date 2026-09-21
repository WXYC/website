import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {render, screen} from '@testing-library/react'
import {createTestLifecycle} from './test-utils'
import FiftiethAnniversary, {
	ALUMNI_FORM_URL,
} from '../components/FiftiethAnniversary'

const lifecycle = createTestLifecycle()

beforeEach(lifecycle.beforeEach)
afterEach(lifecycle.afterEach)

// Stands in for whatever TinaCMS renders into the page — the copy is editable
// at /admin, so no assertion here may depend on its current wording.
function renderPage(children = <p>Save the date.</p>) {
	render(<FiftiethAnniversary>{children}</FiftiethAnniversary>)
}

describe('50th anniversary page', () => {
	it('renders the CMS body copy it is handed', () => {
		renderPage(<p>Check back here for more information.</p>)

		expect(
			screen.getByText('Check back here for more information.')
		).toBeDefined()
	})

	it('links the alumni form, opening it outside the site', () => {
		renderPage()
		const cta = screen.getByRole('link', {
			name: /alumni information/i,
		})

		expect(cta.getAttribute('href')).toBe(ALUMNI_FORM_URL)
		expect(cta.getAttribute('target')).toBe('_blank')
		// target="_blank" without this hands the opened form a live
		// window.opener back into wxyc.org.
		expect(cta.getAttribute('rel')).toBe('noopener noreferrer')
	})

	it('keeps the form reachable when the copy does not link it', () => {
		// The whole point of the page is to get the alumni database filled in,
		// and the copy around the button is editable by anyone with CMS access.
		// The button is in code so that an edit cannot drop the form.
		renderPage(<p>Copy with no link in it at all.</p>)

		const formLinks = screen
			.getAllByRole('link')
			.filter((link) => link.getAttribute('href') === ALUMNI_FORM_URL)
		expect(formLinks).toHaveLength(1)
	})

	it('puts the copy on the opaque surface rather than on the background', () => {
		// White type over the animated WebGL background has no fixed contrast
		// ratio — it depends on the frame (WXYC/website#234). This page is the
		// URL the station emails to alumni, so its legibility cannot be a
		// property of when someone happened to open it.
		renderPage(<p>Check back here for more information.</p>)

		const copy = screen.getByText('Check back here for more information.')
		expect(copy.closest('[data-readable-surface]')).not.toBeNull()

		const cta = screen.getByRole('link', {name: /alumni information/i})
		expect(cta.closest('[data-readable-surface]')).not.toBeNull()
	})

	it('points at the UNC short link rather than the form vendor', () => {
		// go.unc.edu can be re-pointed at a different form without a site
		// deploy; a baked-in secure.lglforms.com URL could not be.
		expect(ALUMNI_FORM_URL).toBe('https://go.unc.edu/WXYCAnniversary')
	})
})
