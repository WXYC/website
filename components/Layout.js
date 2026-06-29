import Head from 'next/head'
import Header from './Header'
import Footer from './Footer'

export const Layout = (props) => {
	return (
		<div>
			<Head>
				<title>WXDU</title>
				<meta
					name="description"
					content="Duke and Durham's alternative, non-commercial radio station"
				/>

				{/* app download banner on iphone */}
				<meta name="apple-itunes-app" content="app-id=353182815" />
			</Head>

				<header className="header">
					<Header />
				</header>

				{/* Main skip-link target for keyboard users. */}
				{/* On mobile the header is fixed (NavPlayer + nav bar, ~104px tall), so pad the
				    content down to clear it. Desktop nav is in-flow, so no offset needed there. */}
				<main id="main-content" tabIndex="-1" className="pt-40 lg:pt-0">{props.children}</main>
				<Footer />
			</div>
		)
	}
