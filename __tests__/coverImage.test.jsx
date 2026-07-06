import {describe, it, expect, afterEach} from 'vitest'
import {render, screen, cleanup} from '@testing-library/react'
import CoverImage from '../components/CoverImage'

describe('CoverImage', () => {
	afterEach(() => cleanup())

	it('renders the cover image with the given src', () => {
		render(<CoverImage src="/uploads/show.jpg" />)
		const img = screen.getByRole('img')
		expect(img.getAttribute('src')).toBe('/uploads/show.jpg')
	})

	it('renders a photo credit caption when credit is provided', () => {
		render(<CoverImage src="/uploads/show.jpg" credit="Juana Molina" />)
		expect(screen.getByText('Photo by Juana Molina')).toBeDefined()
	})

	it('does not render a caption when no credit is provided', () => {
		const {container} = render(<CoverImage src="/uploads/show.jpg" />)
		expect(container.querySelector('figcaption')).toBeNull()
	})

	it('does not render a caption when credit is an empty string', () => {
		const {container} = render(<CoverImage src="/uploads/show.jpg" credit="" />)
		expect(container.querySelector('figcaption')).toBeNull()
	})

	it('does not render a caption when credit is only whitespace', () => {
		const {container} = render(
			<CoverImage src="/uploads/show.jpg" credit="   " />
		)
		expect(container.querySelector('figcaption')).toBeNull()
	})

	it('applies passed className and width to the image', () => {
		render(
			<CoverImage
				src="/uploads/show.jpg"
				className="object-cover"
				width="650px"
			/>
		)
		const img = screen.getByRole('img')
		expect(img.getAttribute('width')).toBe('650px')
		expect(img.className).toContain('object-cover')
	})

	it('passes width and height through to the image', () => {
		render(<CoverImage src="/uploads/show.jpg" width="400" height="400" />)
		const img = screen.getByRole('img')
		expect(img.getAttribute('width')).toBe('400')
		expect(img.getAttribute('height')).toBe('400')
	})

	it('applies figureClassName to the wrapping figure', () => {
		const {container} = render(
			<CoverImage src="/uploads/show.jpg" figureClassName="my-2" />
		)
		const figure = container.querySelector('figure')
		expect(figure.className).toContain('my-2')
	})
})
