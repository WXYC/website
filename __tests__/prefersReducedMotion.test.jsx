import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {render, screen, act} from '@testing-library/react'
import {createTestLifecycle, installMatchMediaStub} from './test-utils'
import {usePrefersReducedMotion} from '../lib/usePrefersReducedMotion'

const lifecycle = createTestLifecycle()

let media = null

beforeEach(lifecycle.beforeEach)
afterEach(() => {
	lifecycle.afterEach()
	media?.restore()
	media = null
})

function Probe() {
	return <span data-testid="probe">{String(usePrefersReducedMotion())}</span>
}

function readProbe() {
	return screen.getByTestId('probe').textContent
}

describe('usePrefersReducedMotion', () => {
	it('reports false when the reader has not asked for reduced motion', () => {
		media = installMatchMediaStub({matches: false})
		render(<Probe />)

		expect(readProbe()).toBe('false')
	})

	it('reports true on the very first render when the preference is already set', () => {
		// Not "true once an effect has run": a hook that starts at false and
		// corrects itself in an effect lets one frame of animation through
		// before it is stopped, which is exactly what the reader asked not to
		// see.
		media = installMatchMediaStub({matches: true})
		render(<Probe />)

		expect(readProbe()).toBe('true')
	})

	it('asks for the standard reduced-motion query', () => {
		media = installMatchMediaStub({matches: false})
		render(<Probe />)

		expect(window.matchMedia).toHaveBeenCalledWith(
			'(prefers-reduced-motion: reduce)'
		)
	})

	it('follows a change to the OS setting without a reload', () => {
		media = installMatchMediaStub({matches: false})
		render(<Probe />)

		act(() => media.setMatches(true))
		expect(readProbe()).toBe('true')

		act(() => media.setMatches(false))
		expect(readProbe()).toBe('false')
	})

	it('reports false when the browser has no matchMedia at all', () => {
		const original = window.matchMedia
		delete window.matchMedia
		try {
			render(<Probe />)
			expect(readProbe()).toBe('false')
		} finally {
			window.matchMedia = original
		}
	})
})
