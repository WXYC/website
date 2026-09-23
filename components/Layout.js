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
				{/* Both icons are generated from images/app-icon.png by
				    scripts/generate-icons.py -- never hand-edited, so they cannot
				    drift from the station's artwork. This used to point at an
				    Apple CDN thumbnail (is4-ssl.mzstatic.com), which made every
				    page load depend on a third party for a first-party asset and
				    would have broken silently if that URL ever rotated. */}
				<link rel="icon" href="/favicon.ico" />

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
