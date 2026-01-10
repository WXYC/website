import {defineConfig} from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
	plugins: [
		react({
			include: /\.(jsx?|tsx?)$/,
		}),
	],
	esbuild: {
		jsx: 'automatic',
		include: /\.[jt]sx?$/,
		exclude: [],
	},
	test: {
		environment: 'jsdom',
		globals: true,
	},
})
