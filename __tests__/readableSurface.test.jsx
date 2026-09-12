import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {render, screen} from '@testing-library/react'
import {createTestLifecycle} from './test-utils'
import ReadableSurface from '../components/ReadableSurface'

const lifecycle = createTestLifecycle()

beforeEach(lifecycle.beforeEach)
afterEach(lifecycle.afterEach)

function renderSurface(props = {}) {
	render(
		<ReadableSurface {...props}>
			<p>Juana Molina</p>
		</ReadableSurface>
	)
	return screen.getByText('Juana Molina').closest('[data-readable-surface]')
}

describe('ReadableSurface', () => {
	it('marks itself so a page can assert its content sits on the surface', () => {
		expect(renderSurface()).not.toBeNull()
	})

	it('paints a fully opaque background', () => {
		// The point of the surface is that contrast over it is a constant, not
		// a per-frame accident of whatever the animated background is doing
		// underneath. Any alpha at all — `bg-black/95` included — reintroduces
		// the dependency this component exists to remove.
		const surface = renderSurface()
		const classes = surface.className.split(/\s+/)

		expect(classes).toContain('bg-black')
		expect(classes.filter((name) => name.startsWith('bg-'))).toEqual([
			'bg-black',
		])
	})

	it('keeps the caller’s own classes alongside its own', () => {
		const surface = renderSurface({className: 'mt-10'})

		expect(surface.className).toContain('mt-10')
		expect(surface.className).toContain('bg-black')
	})
})
