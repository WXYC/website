import Head from 'next/head'
import Header from './Header'
import Footer from './Footer'

export const Layout = (props) => {
	return (
		<div>
			<Head>
				<title>WXYC</title>
				<meta
					name="description"
					content="UNC-Chapel Hill's student-run, freeform radio station"
				/>
				<link
					rel="icon"
					href="https://is4-ssl.mzstatic.com/image/thumb/Purple116/v4/6c/55/f8/6c55f8ad-cfed-ddd7-e63d-9e8c979d7251/source/512x512bb.jpg"
				/>

				{/* iOS probes /apple-touch-icon.png and the -precomposed variant at the
				    site root when no link declares one, which is where a few hundred
				    404s a week came from. Declaring it stops the blind probe; the
				    -precomposed path is redirected here in public/_redirects. */}
				<link rel="apple-touch-icon" href="/apple-touch-icon.png" />

				{/* app download banner on iphone */}
				<meta name="apple-itunes-app" content="app-id=353182815" />
			</Head>

			<header className="header">
				<Header />
			</header>

			<main>{props.children}</main>
			<Footer />
		</div>
	)
}
