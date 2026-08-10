import React, {useEffect, useState} from 'react'
import Head from 'next/head'
import {API_BASE, describeNonTrackEntry, isTrack} from '../lib/flowsheetRange'

/**
 * Live playlist — a public, unauthenticated view of the most recent flowsheet
 * entries, refreshing while the tab stays open. Successor to
 * `wxyc.info/playlists/recent`, which goes dark at the 2026-08-31 tubafrenzy
 * cutover (WXYC/wiki#93).
 *
 * Data source: Backend-Service `GET /flowsheet?page=0&limit=50`. This is a
 * different endpoint from the range-based historical archive
 * (`pages/playlists/archive.jsx`, `GET /flowsheet/range`): it returns one flat
 * `entries` array, already newest-first, plus pagination metadata and the
 * currently on-air DJ — there is no separate `shows` array and so no grouping
 * step here. Track/non-track discrimination (`isTrack`, `describeNonTrackEntry`)
 * is reused from `lib/flowsheetRange.js` rather than re-derived, since the
 * `entry_type` discriminated union is identical across both endpoints.
 *
 * File is `.jsx` rather than `.js` so vitest's esbuild pipeline parses the JSX
 * in it directly — see `pages/playlists/archive.jsx` for the same convention.
 * Next.js resolves either extension to the same `/playlist` route.
 */

const PAGE_LIMIT = 50

/**
 * How often to re-poll while the page is open, in milliseconds.
 *
 * Matches the flowsheet poll cadence dj-site already uses for the same
 * underlying table, rather than inventing a different one for the public
 * surface reading it.
 */
export const REFRESH_INTERVAL_MS = 60000

/**
 * Fetch the most recent page of the flowsheet.
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {typeof fetch} [options.fetchImpl] Injectable fetch, for tests.
 * @returns {Promise<{entries: Array, total: number, page: number, limit: number, totalPages: number, on_air: ?{dj_name: ?string}}>}
 * @throws {Error} On a non-OK response.
 */
async function fetchRecentFlowsheet(options = {}) {
	const {signal, fetchImpl = fetch} = options

	const response = await fetchImpl(
		`${API_BASE}/flowsheet?page=0&limit=${PAGE_LIMIT}`,
		{
			// Public, anonymous read — no session to send, and sending one would
			// defeat the origin-scoped CORS allowlist Backend-Service exposes to
			// wxyc.org.
			credentials: 'omit',
			signal,
		}
	)

	if (!response.ok) {
		throw new Error(`Could not load the playlist (${response.status}).`)
	}

	return response.json()
}

function PlaylistRow({entry}) {
	if (!isTrack(entry)) {
		return (
			<tr>
				<td
					colSpan={5}
					className="bg-white/5 px-3 py-1 text-center text-xs uppercase tracking-wide text-white/50"
				>
					{describeNonTrackEntry(entry)}
				</td>
			</tr>
		)
	}

	return (
		<tr className="border-b border-white/10 last:border-0">
			<td className="px-3 py-1.5 text-center text-xs text-white/60">
				{entry.rotation_bin || ''}
			</td>
			<td className="px-3 py-1.5">{entry.artist_name}</td>
			<td className="px-3 py-1.5">{entry.track_title}</td>
			<td className="px-3 py-1.5 text-white/70">{entry.album_title}</td>
			<td className="px-3 py-1.5 text-white/70">
				{entry.record_label}
				{entry.request_flag ? (
					<span className="ml-1 text-white/50" title="Listener request">
						(request)
					</span>
				) : null}
			</td>
		</tr>
	)
}

const LivePlaylist = () => {
	// null until the first fetch resolves, so "no data yet" and "fetched an
	// empty page" are distinguishable.
	const [entries, setEntries] = useState(null)
	const [onAirDjName, setOnAirDjName] = useState(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState(null)

	useEffect(() => {
		const controller = new AbortController()

		// `showSpinner` is false on the interval's background polls: a
		// once-a-minute refresh should update the table in place, not flash the
		// whole page back to a loading state around it.
		const load = async ({showSpinner}) => {
			if (showSpinner) setIsLoading(true)
			try {
				const data = await fetchRecentFlowsheet({signal: controller.signal})
				setEntries(data?.entries ?? [])
				setOnAirDjName(data?.on_air?.dj_name ?? null)
				setError(null)
			} catch (err) {
				if (err.name === 'AbortError') return
				// A background poll that fails leaves the last good playlist on
				// screen rather than replacing it with an error — the table is
				// still true, just up to a minute stale. Only surface the error
				// state when there is nothing else to show yet.
				setError(err.message || 'Could not load the playlist.')
			} finally {
				if (showSpinner) setIsLoading(false)
			}
		}

		load({showSpinner: true})
		const intervalId = setInterval(
			() => load({showSpinner: false}),
			REFRESH_INTERVAL_MS
		)

		return () => {
			controller.abort()
			clearInterval(intervalId)
		}
	}, [])

	return (
		<>
			<Head>
				<title>Live Playlist | WXYC</title>
				<meta
					name="description"
					content="What WXYC 89.3 FM is playing right now."
				/>
			</Head>

			<div className="mx-auto w-full px-4 pb-16 sm:w-5/6">
				<h1 className="kallisto mb-2 text-5xl">Live Playlist</h1>
				{onAirDjName ? (
					<p className="mb-6 text-white/70">
						On the air now: <span className="text-white">{onAirDjName}</span>
					</p>
				) : (
					<p className="mb-6 text-white/70">The most recent songs on WXYC.</p>
				)}

				{isLoading ? (
					<p role="status">Loading the playlist…</p>
				) : error && entries === null ? (
					<div role="alert">
						<p>{error}</p>
					</div>
				) : entries && entries.length === 0 ? (
					<p>Nothing has aired recently.</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="sr-only">
								<tr>
									<th>Rotation</th>
									<th>Artist</th>
									<th>Song</th>
									<th>Release</th>
									<th>Label</th>
								</tr>
							</thead>
							<tbody>
								{(entries ?? []).map((entry) => (
									<PlaylistRow key={entry.id} entry={entry} />
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</>
	)
}

export default LivePlaylist
