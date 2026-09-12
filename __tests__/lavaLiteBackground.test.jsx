import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, act, fireEvent} from '@testing-library/react'
import {createTestLifecycle, installMatchMediaStub} from './test-utils'
import LavaLiteBackground from '../components/LavaLiteBackground'

/**
 * Minimal stand-in for a WebGL2 context.
 *
 * jsdom implements no canvas contexts at all, so without this the component
 * takes its unsupported-hardware path and renders the flat black fallback —
 * which would make every assertion here pass for the wrong reason.
 */
function createFakeGl() {
	const noop = vi.fn()
	return {
		// Enum values are only ever passed straight back to this object, so
		// any distinct placeholders will do.
		VERTEX_SHADER: 1,
		FRAGMENT_SHADER: 2,
		COMPILE_STATUS: 3,
		LINK_STATUS: 4,
		ARRAY_BUFFER: 5,
		STATIC_DRAW: 6,
		TEXTURE_2D: 7,
		RGBA: 8,
		UNSIGNED_BYTE: 9,
		TEXTURE_WRAP_S: 10,
		TEXTURE_WRAP_T: 11,
		REPEAT: 12,
		TEXTURE_MIN_FILTER: 13,
		TEXTURE_MAG_FILTER: 14,
		LINEAR: 15,
		TEXTURE0: 16,
		FLOAT: 17,
		TRIANGLE_STRIP: 18,
		createShader: vi.fn(() => ({})),
		shaderSource: noop,
		compileShader: noop,
		getShaderParameter: vi.fn(() => true),
		createProgram: vi.fn(() => ({})),
		attachShader: noop,
		linkProgram: noop,
		getProgramParameter: vi.fn(() => true),
		createBuffer: vi.fn(() => ({})),
		bindBuffer: noop,
		bufferData: noop,
		getAttribLocation: vi.fn(() => 0),
		enableVertexAttribArray: noop,
		vertexAttribPointer: noop,
		createTexture: vi.fn(() => ({})),
		bindTexture: noop,
		texImage2D: noop,
		texParameteri: noop,
		getUniformLocation: vi.fn(() => ({})),
		useProgram: noop,
		activeTexture: noop,
		uniform1i: noop,
		uniform1f: noop,
		uniform2f: noop,
		uniform3f: noop,
		viewport: noop,
		drawArrays: vi.fn(),
		deleteTexture: noop,
		deleteBuffer: noop,
		deleteProgram: noop,
	}
}

/**
 * Replaces the animation-frame pair with a hand-driven queue, so a test can
 * tell "scheduled another frame" apart from "drew one and stopped".
 */
function installAnimationFrameStub() {
	const originalRequest = window.requestAnimationFrame
	const originalCancel = window.cancelAnimationFrame
	const frames = new Map()
	let nextId = 1

	window.requestAnimationFrame = vi.fn((callback) => {
		const id = nextId++
		frames.set(id, callback)
		return id
	})
	window.cancelAnimationFrame = vi.fn((id) => frames.delete(id))

	return {
		get requestCount() {
			return window.requestAnimationFrame.mock.calls.length
		},
		get cancelCount() {
			return window.cancelAnimationFrame.mock.calls.length
		},
		restore() {
			window.requestAnimationFrame = originalRequest
			window.cancelAnimationFrame = originalCancel
		},
	}
}

const lifecycle = createTestLifecycle()

let gl = null
let media = null
let frames = null
let originalGetContext = null

beforeEach(() => {
	lifecycle.beforeEach()
	gl = createFakeGl()
	originalGetContext = HTMLCanvasElement.prototype.getContext
	HTMLCanvasElement.prototype.getContext = vi.fn(() => gl)
	frames = installAnimationFrameStub()
})

afterEach(() => {
	lifecycle.afterEach()
	HTMLCanvasElement.prototype.getContext = originalGetContext
	frames.restore()
	media?.restore()
	media = null
})

describe('LavaLiteBackground', () => {
	it('animates for a reader who has not asked for reduced motion', () => {
		media = installMatchMediaStub({matches: false})
		render(<LavaLiteBackground />)

		expect(frames.requestCount).toBeGreaterThan(0)
	})

	it('draws one static frame and schedules no animation under prefers-reduced-motion', () => {
		media = installMatchMediaStub({matches: true})
		render(<LavaLiteBackground />)

		// The background is frozen, not blanked: the identity survives, the
		// movement does not.
		expect(gl.drawArrays).toHaveBeenCalledTimes(1)
		expect(frames.requestCount).toBe(0)
	})

	it('redraws the frozen frame when the window is resized', () => {
		// Resizing sets `canvas.width`, which clears the drawing buffer. An
		// animation loop repaints it on the next frame; a frozen background has
		// no next frame, so it would be left blank.
		media = installMatchMediaStub({matches: true})
		render(<LavaLiteBackground />)
		expect(gl.drawArrays).toHaveBeenCalledTimes(1)

		act(() => {
			fireEvent(window, new Event('resize'))
		})

		expect(gl.drawArrays).toHaveBeenCalledTimes(2)
		expect(frames.requestCount).toBe(0)
	})

	it('stops animating when the reader turns reduced motion on mid-session', () => {
		media = installMatchMediaStub({matches: false})
		render(<LavaLiteBackground />)
		const countWhileAnimating = frames.requestCount
		expect(countWhileAnimating).toBeGreaterThan(0)

		act(() => media.setMatches(true))

		expect(frames.cancelCount).toBeGreaterThan(0)
		expect(frames.requestCount).toBe(countWhileAnimating)
	})
})
