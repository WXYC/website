import React, {useCallback, useEffect, useRef, useState} from 'react'
import Head from 'next/head'
import {
	API_BASE,
	compareEntriesByAirOrderDesc,
	describeNonTrackEntry,
	isTrack,
} from '../lib/flowsheetRange'

/**
 * Live playlist — a public, unauthenticated view of the most recent flowsheet
 * entries, refreshing while the tab stays open. Successor to
 * `wxyc.info/playlists/recent`, which goes dark at the 2026-08-31 tubafrenzy
 * cutover (WXYC/wiki#93).
 *
 * Data source: Backend-Service `GET /flowsheet?page=0&limit=50`. This is a
 * different endpoint from the range-based historical archive
 * (`pages/playlists/archive.jsx`, `GET /flowsheet/range`): it returns one flat
 * `entries` array plus pagination metadata and the currently on-air DJ — there
 * is no separate `shows` array and so no grouping step here. Track/non-track
 * discrimination (`isTrack`, `describeNonTrackEntry`) and air-order sorting
 * (`compareEntriesByAirOrderDesc`) are reused from `lib/flowsheetRange.js`
 * rather than re-derived, since the `entry_type` discriminated union and the
 * `play_order`-over-arrival-order rule are identical across both endpoints.
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
 * Marks a message as curated copy from {@link fetchRecentFlowsheet} itself,
 * as opposed to a raw message bubbling up from `fetch()` or `response.json()`.
 * A network failure, a CORS rejection, or a non-JSON body all reject with a
 * browser-authored `Error` whose `message` is technical ("Failed to fetch",
 * `Unexpected token '<'...`) and unfit for a public error state. Only a
 * `FlowsheetFetchError` message is safe to render verbatim; every other
 * rejection collapses to a generic fallback — see the `catch` in `load`
 * below.
 */
class FlowsheetFetchError extends Error {}

/**
 * Fetch the most recent page of the flowsheet.
 *
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {typeof fetch} [options.fetchImpl] Injectable fetch, for tests.
 * @returns {Promise<{entries: Array, total: number, page: number, limit: number, totalPages: number, on_air: ?{dj_name: ?string}}>}
 * @throws {FlowsheetFetchError} On a non-OK response.
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
		throw new FlowsheetFetchError(
			`Could not load the playlist (${response.status}).`
		)
	}

	return response.json()
}

/** An instant as a local `HH:MM` clock time, for the staleness notice. */
function formatClockTime(date) {
	return date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})
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
	const [error, setError] = useState(null)
	// Set on every successful fetch; drives the "Last updated HH:MM" staleness
	// notice when a later poll fails and the last-good playlist stays on screen.
	const [lastUpdatedAt, setLastUpdatedAt] = useState(null)

	// Holds the in-flight request's controller so a new poll can abort a still-
	// pending older one, and so a response can check it is still the current
	// request before applying itself. Without this, a poll that takes longer
	// than the 60s interval can resolve after a faster later poll and overwrite
	// fresh data with stale — a documented backend-wedge pattern.
	const abortControllerRef = useRef(null)

	// There is no separate `isLoading` state to track: "loading" is simply
	// "no outcome yet", i.e. neither a successful response nor an error has
	// landed for the current request line. Deriving it this way — rather than
	// toggling a boolean from `load` — means it can never depend on which
	// controller a given call happened to hold. An earlier version tied
	// clearing it to `showSpinner && abortControllerRef.current === controller`
	// inside `load`'s `finally`; every superseding call aborts the previous
	// controller before its own fetch resolves, so the superseded call's
	// `finally` always saw a stale controller and skipped clearing it, and the
	// superseding call (spinner-less, by design) never set it either — the
	// page stuck on "Loading the playlist…" forever even after fresh data
	// arrived. `entries`/`error` are only ever written by the request that is
	// still current at the time it settles (see the guard in `load` below), so
	// deriving from them is automatically immune to the same bug class.
	const isLoading = entries === null && error === null

	const load = useCallback(async () => {
		abortControllerRef.current?.abort()
		const controller = new AbortController()
		abortControllerRef.current = controller

		try {
			const data = await fetchRecentFlowsheet({signal: controller.signal})
			// A superseded poll's fetch can still resolve after the one that
			// replaced it. Only apply a response while its request is still the
			// current one.
			if (abortControllerRef.current !== controller) return
			const sortedEntries = [...(data?.entries ?? [])].sort(
				compareEntriesByAirOrderDesc
			)
			setEntries(sortedEntries)
			setOnAirDjName(data?.on_air?.dj_name ?? null)
			setError(null)
			setLastUpdatedAt(new Date())
		} catch (err) {
			if (err?.name === 'AbortError') return
			if (abortControllerRef.current !== controller) return
			// A background poll that fails leaves the last good playlist on
			// screen rather than replacing it with an error — the table is
			// still true, just up to a minute stale. Only the fully-blocking
			// error state (nothing loaded yet) replaces the page; a stale-data
			// poll failure instead shows a "Last updated" notice — see the
			// render below.
			setError(
				err instanceof FlowsheetFetchError
					? err.message
					: 'Could not load the playlist.'
			)
		}
	}, [])

	useEffect(() => {
		load()

		// The interval is started/stopped rather than left running while the tab
		// is hidden: the response is ~51 KB with `Cache-Control: no-cache`, and
		// browsers already throttle a background tab's timers to about once a
		// minute — exactly this cadence, so backgrounding alone buys no relief.
		// A tab left open for a workday would otherwise still issue ~1,440
		// requests. Visibility gating stops them outright and catches the page
		// up with one fetch when the tab is shown again.
		let intervalId = null
		const startInterval = () => {
			if (intervalId !== null) return
			intervalId = setInterval(() => load(), REFRESH_INTERVAL_MS)
		}
		const stopInterval = () => {
			if (intervalId === null) return
			clearInterval(intervalId)
			intervalId = null
		}

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'hidden') {
				stopInterval()
			} else {
				load()
				startInterval()
			}
		}

		startInterval()
		document.addEventListener('visibilitychange', handleVisibilityChange)

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange)
			stopInterval()
			abortControllerRef.current?.abort()
		}
	}, [load])

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
				) : (
					<>
						{error && entries !== null ? (
							<div
								role="status"
								className="mb-4 flex flex-wrap items-center gap-3 border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/70"
							>
								<p>
									Last updated{' '}
									{lastUpdatedAt ? formatClockTime(lastUpdatedAt) : '—'} —
									couldn&rsquo;t refresh.
								</p>
								<button
									type="button"
									onClick={() => load()}
									className="rounded border border-white/30 px-3 py-1"
								>
									Retry
								</button>
							</div>
						) : null}

						{entries && entries.length === 0 ? (
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
					</>
				)}
			</div>
		</>
	)
}

export default LivePlaylist
