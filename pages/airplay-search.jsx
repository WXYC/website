import React, {useEffect, useState} from 'react'
import Head from 'next/head'
import {
	DEFAULT_PAGE_SIZE,
	fetchFlowsheetSearch,
	formatPlayDate,
} from '../lib/flowsheetSearch'

/**
 * Public airplay-search page — the successor to
 * `wxyc.info/playlists/searchPlaylists`, which dies at the 2026-08-31
 * tubafrenzy cutover.
 *
 * Client-side only: this site is a static export, so the query and the
 * results live entirely in component state rather than a route or an SSR
 * prop. The search box is debounced so a listener typing a query does not
 * fire one request per keystroke against a public API, and an empty query is
 * a real, supported state — the backend serves its most-recent-tracks
 * default for it, which becomes this page's landing view.
 */

/** How long to wait after the last keystroke before searching. */
const DEBOUNCE_MS = 400

function SearchResultRow({row}) {
	return (
		<tr className="border-b border-white/10 last:border-0">
			<td className="px-3 py-1.5">{row.artist_name}</td>
			<td className="px-3 py-1.5">{row.track_title}</td>
			<td className="px-3 py-1.5 text-white/70">{row.album_title}</td>
			<td className="px-3 py-1.5 text-white/70">{row.record_label}</td>
			<td className="whitespace-nowrap px-3 py-1.5 text-white/70">
				{formatPlayDate(row.play_date)}
			</td>
			<td className="px-3 py-1.5 text-white/70">{row.dj_name}</td>
		</tr>
	)
}

const INITIAL_SEARCH = {q: '', page: 0}

const AirplaySearch = () => {
	// Raw input value, updated on every keystroke.
	const [query, setQuery] = useState('')
	// The query actually searched for and the page within it, held as one
	// object updated atomically. A search and its page number have to change
	// together: a separate `setPage(0)` effect keyed off the debounced query
	// races the fetch effect, because both fire in the same commit and the
	// fetch effect still reads the pre-reset page on that pass — one request
	// goes out for the old page, a second follows once the reset lands. See
	// `pages/playlists/archive.jsx` for the same trap in the week picker.
	const [search, setSearch] = useState(INITIAL_SEARCH)

	const [data, setData] = useState(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState(null)
	// Bumped by Retry. A plain re-fetch of the same query/page would be a
	// no-op from React's point of view, since neither dependency changed.
	const [reloadToken, setReloadToken] = useState(0)

	useEffect(() => {
		const timer = setTimeout(() => {
			const trimmed = query.trim()
			// A new search starts back at the first page — paging deep into one
			// query and then searching for something else should not silently
			// request a page number the new query may not have.
			setSearch((prev) => (prev.q === trimmed ? prev : {q: trimmed, page: 0}))
		}, DEBOUNCE_MS)
		return () => clearTimeout(timer)
	}, [query])

	useEffect(() => {
		const controller = new AbortController()
		setIsLoading(true)
		setError(null)

		fetchFlowsheetSearch(
			{q: search.q, page: search.page, limit: DEFAULT_PAGE_SIZE},
			{signal: controller.signal}
		)
			.then((response) => {
				setData(response)
				setIsLoading(false)
			})
			.catch((err) => {
				if (err.name === 'AbortError') return
				setError(err.message || 'Could not search airplay records.')
				setData(null)
				setIsLoading(false)
			})

		return () => controller.abort()
	}, [search, reloadToken])

	const results = data?.results ?? []
	const totalPages = data?.totalPages ?? 0
	const canGoBack = search.page > 0
	const canGoForward = search.page + 1 < totalPages
	const goToPage = (page) => setSearch((prev) => ({...prev, page}))

	return (
		<>
			<Head>
				<title>Airplay Search | WXYC</title>
				<meta
					name="description"
					content="Search WXYC's airplay records by artist, track, album, or label."
				/>
			</Head>

			<div className="mx-auto w-full px-4 pb-16 sm:w-5/6">
				<h1 className="kallisto mb-2 text-5xl">Airplay Search</h1>
				<p className="mb-2 text-white/70">
					Search everything WXYC has played. Leave the box empty for the most
					recent airplay.
				</p>
				<p className="mb-6 text-sm text-white/50">
					Tip: narrow a search by field, e.g.{' '}
					<code className="text-white/70">
						artist:foo AND album:&quot;bar&quot;
					</code>{' '}
					— a colon in a plain search is read as that syntax, so a literal colon
					in a title may need quoting.
				</p>

				<label className="mb-6 block">
					<span className="sr-only">Search airplay records</span>
					<input
						type="search"
						role="searchbox"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search artist, track, album, or label…"
						className="w-full rounded border border-white/30 bg-transparent px-3 py-2 sm:w-2/3"
					/>
				</label>

				{isLoading ? (
					<p role="status">
						{search.q ? 'Searching…' : 'Loading recent airplay…'}
					</p>
				) : error ? (
					<div role="alert">
						<p className="mb-2">{error}</p>
						<button
							type="button"
							onClick={() => setReloadToken((n) => n + 1)}
							className="rounded border border-white/30 px-3 py-1"
						>
							Retry
						</button>
					</div>
				) : results.length === 0 ? (
					<p>
						{search.q
							? `No airplay found for “${search.q}”.`
							: 'No airplay has been recorded yet.'}
					</p>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="w-full text-left text-sm">
								<thead>
									<tr className="border-b border-white/20 text-white/60">
										<th className="px-3 py-1.5 font-normal">Artist</th>
										<th className="px-3 py-1.5 font-normal">Track</th>
										<th className="px-3 py-1.5 font-normal">Album</th>
										<th className="px-3 py-1.5 font-normal">Label</th>
										<th className="px-3 py-1.5 font-normal">Played</th>
										<th className="px-3 py-1.5 font-normal">DJ</th>
									</tr>
								</thead>
								<tbody>
									{results.map((row) => (
										<SearchResultRow key={row.id} row={row} />
									))}
								</tbody>
							</table>
						</div>

						<div className="mt-6 flex flex-wrap items-center gap-3">
							<button
								type="button"
								onClick={() => goToPage(search.page - 1)}
								disabled={!canGoBack}
								className="rounded border border-white/30 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
							>
								← Previous
							</button>
							<span className="text-white/60">
								Page {totalPages === 0 ? 0 : search.page + 1} of {totalPages}
								{typeof data?.total === 'number'
									? ` (${data.total} total plays)`
									: null}
							</span>
							<button
								type="button"
								onClick={() => goToPage(search.page + 1)}
								disabled={!canGoForward}
								className="rounded border border-white/30 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
							>
								Next →
							</button>
						</div>
					</>
				)}
			</div>
		</>
	)
}

export default AirplaySearch
