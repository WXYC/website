/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		'./app/**/*.{js,ts,jsx,tsx,mdx}',
		'./pages/**/*.{js,ts,jsx,tsx,mdx}',
		'./components/**/*.{js,ts,jsx,tsx,mdx}',
	],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Futura', 'Futura-Medium', 'Poppins', 'Century Gothic', 'sans-serif'],
				kallisto: ['kallisto', 'serif'],
			},
			objectFit: {
				cover: 'cover',
			},
		},
	},
	plugins: [require('@tailwindcss/typography')],
}
