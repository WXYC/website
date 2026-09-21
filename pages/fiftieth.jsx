import Head from 'next/head'
import Link from 'next/link'
import {useEffect} from 'react'
import {useRouter} from 'next/router'

const TARGET = '/50th'

/**
 * `/fiftieth` — a spelled-out alias for `/50th`, for anyone who types the word
 * rather than the digits.
 *
 * On the live origin this page is never served: `public/_redirects` turns the
 * request into a real 301 at the edge, and Cloudflare follows a redirect rule
 * before it serves a matching asset. This exists for the two places that
 * ignore `_redirects` — the GitHub Pages deploy, which still runs in parallel
 * as the WXYC/website#262 rollback target, and `next dev`, where without it
 * the alias could not be checked locally at all.
 *
 * A static export cannot answer with a 3xx (`redirects()` in next.config.js is
 * unsupported under `output: 'export'`), so the fallback is a meta refresh,
 * which also covers a reader with JavaScript off, plus a `router.replace` so
 * that in a normal browser the hop does not land in history and turn Back into
 * a loop.
 */
export default function Fiftieth() {
	const router = useRouter()

	useEffect(() => {
		router.replace(TARGET)
	}, [router])

	return (
		<>
			<Head>
				<title>WXYC&apos;s 50th Anniversary</title>
				<meta httpEquiv="refresh" content={`0; url=${TARGET}`} />
				<meta name="robots" content="noindex" />
				<link rel="canonical" href={`https://wxyc.org${TARGET}`} />
			</Head>

			<div className="mx-auto w-5/6 pb-16 text-center">
				<p>
					Taking you to{' '}
					<Link href={TARGET} className="text-blue-500">
						WXYC&apos;s 50th anniversary page
					</Link>
					.
				</p>
			</div>
		</>
	)
}
