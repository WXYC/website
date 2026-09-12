import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import Head from 'next/head'
import {useRouter} from 'next/router'
import {formatNumericDate} from '../lib/easternTime'
import {
	EmptySetError,
	FlowsheetFetchError,
	describeSet,
	fetchRecentFlowsheet,
	fetchSet,
} from '../lib/flowsheet'
import {
	UNKNOWN_DJ_LABEL,
	compareEntriesByAirOrderDesc,
	describeNonTrackEntry,
	formatShowTime,
	isTrack,
} from '../lib/flowsheetRange'
import ReadableSurface from '../components/ReadableSurface'

/**
 * Live playlist — a public, unauthenticated view of the most recent flowsheet
 * entries, refreshing while the tab stays open. Successor to
 * `wxyc.info/playlists/recent`, which goes dark at the 2026-09-07 tubafrenzy
 * cutover (WXYC/wiki#93).
 *
 * Data source: Backend-Service `GET /flowsheet`, through `lib/flowsheet.js`.
 * That is a different endpoint from the range-based historical archive
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

/**
 * How often to re-poll while the page is open, in milliseconds.
 *
 * Matches the flowsheet poll cadence dj-site already uses for the same
 * underlying table, rather than inventing a different one for the public
 * surface reading it.
 */
export const REFRESH_INTERVAL_MS = 60000

/**
 * The `?set=` value for the landing view — the rolling window of recent plays,
 * as opposed to any one set.
 *
 * Zero rather than a separate sentinel because it is also the endpoint's own
 * depth for "the current set", and `?set=0` arriving in the URL should mean
 * the same thing as no `?set=` at all rather than being a third state.
 */
const LANDING_VIEW = 0

/**
 * Deepest set reachable by URL.
 *
 * Not a limit anyone can click into: stepping back one set at a time, this is
 * further than the archive goes (production holds on the order of 70,000
 * shows, but a reader would have to press the button 5,000 times to get
 * here). It exists to bound a hand-typed or crawled `?set=`, so the offset
 * Backend computes stays a number rather than whatever someone put in the
 * query string.
 */
const MAX_SET_PAGE = 5000

/**
 * The set depth a query string is asking for.
 *
 * Anything that is not a positive integer within range — a float, a negative,
 * a word, `?set=0` — resolves to the landing view rather than an error. A bad
 * `?set=` is a typo or a crawler, and the rolling window is a better answer
 * than a complaint.
 *
 * @param {unknown} value `router.query.set`
 * @returns {number} `LANDING_VIEW`, or a set depth of 1 or more.
 */
export function setPageFromQuery(value) {
	if (typeof value !== 'string' || !/^\d+$/.test(value)) return LANDING_VIEW
	const page = Number(value)
	if (page < 1 || page > MAX_SET_PAGE) return LANDING_VIEW
	return page
}

/** An instant as a local `HH:MM` clock time, for the staleness notice. */
function formatClockTime(date) {
	return date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})
}

/**
 * The marks a track row can carry in its leading column, and the words the
 * key below the heading uses for them.
 *
 * Both are flags about a single play, so they share one column rather than
 * being scattered across the row — a request used to be the literal text
 * "(request)" three columns over, in a different vocabulary from the rotation
 * mark. The bin a rotation play came from is deliberately not named: that is
 * the library's own H/M/L/S weighting (wxyc-shared/api.yaml `RotationBin`),
 * internal bookkeeping about how hard a record is being pushed rather than
 * anything a listener reading a playlist is asking. See WXYC/website#236 and
 * #239.
 */
const ROW_MARKERS = [
	{
		glyph: '\u25CF',
		label: 'In rotation',
		has: (entry) => Boolean(entry.rotation_bin),
	},
	{
		glyph: '\u2605',
		label: 'Listener request',
		has: (entry) => Boolean(entry.request_flag),
	},
]

/**
 * The leading cell's marks for one track.
 *
 * Each mark keeps `sr-only` text of its own. The key is a visual aid, and a
 * screen reader working through a table has no way back up the page to
 * interpret a bare glyph — worse here than elsewhere, because the header row
 * on these tables is itself `sr-only`.
 */
function RowMarkers({entry}) {
	return (
		<span className="inline-flex items-center justify-center gap-1">
			{ROW_MARKERS.filter((marker) => marker.has(entry)).map((marker) => (
				<span key={marker.label}>
					<span aria-hidden="true" title={marker.label}>
						{marker.glyph}
					</span>
					<span className="sr-only">{marker.label}</span>
				</span>
			))}
		</span>
	)
}

/** What the marks mean, printed once above the list. */
function MarkerKey() {
	return (
		<ul
			role="list"
			aria-label="What the marks mean"
			className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/60"
		>
			{ROW_MARKERS.map((marker) => (
				<li key={marker.label}>
					<span aria-hidden="true">{marker.glyph}</span>{' '}
					{marker.label.toLowerCase()}
				</li>
			))}
		</ul>
	)
}

/**
 * Columns in the table below, so the separator rows' `colSpan` and the
 * `sr-only` header cannot drift apart from the cells they describe.
 */
const COLUMNS = ['Rotation', 'Artist', 'Song', 'Release', 'Label', 'Date']

function PlaylistRow({entry}) {
	if (!isTrack(entry)) {
		return (
			<tr>
				{/* Still spanning every column, date included. A separator row is
				    read as a band, and cutting a date cell out of the left edge of
				    it would reopen exactly the gap #243 closed. Two of these rows
				    carry their timing in their own text — a sign-on names its
				    clock time (#241), a breakpoint names its hour — and two do
				    not: `dj_join` and `dj_leave` render as "{name} joined" /
				    "{name} left" and say nothing about when. That is a real gap,
				    not a claim that none exists; it is left open rather than
				    reopening the band for the two rarest row types on the
				    page. */}
				<td
					colSpan={COLUMNS.length}
					className="bg-white/10 px-3 py-1 text-center text-xs tracking-wide text-white/70"
				>
					{describeNonTrackEntry(entry)}
				</td>
			</tr>
		)
	}

	return (
		<tr className="border-b border-white/10 last:border-0">
			<td className="px-3 py-1.5 text-center text-xs text-white/60">
				<RowMarkers entry={entry} />
			</td>
			<td className="px-3 py-1.5">{entry.artist_name}</td>
			<td className="px-3 py-1.5">{entry.track_title}</td>
			<td className="px-3 py-1.5 text-white/70">{entry.album_title}</td>
			<td className="px-3 py-1.5 text-white/70">{entry.record_label}</td>
			{/* Last rather than first, so the marks keep the leading column the
			    key above the list points at. Not claimed to match
			    `/airplay-search`: that page puts its `Played` column fifth of
			    six, left-aligned, as a long "July 21, 2026, 11:47 AM" — a
			    different position, alignment and format, answering a slightly
			    different question. `formatNumericDate` returns the empty string
			    for an unusable `add_time`, which renders as an empty cell — the
			    honest rendering of "we don't know", and better than a dash the
			    reader has to decode. */}
			<td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-white/70">
				{formatNumericDate(entry.add_time)}
			</td>
		</tr>
	)
}

/**
 * Step between the rolling landing view and one set at a time.
 *
 * The two halves are labelled differently on purpose, because they are not
 * the same unit of content. The landing view is a fixed window of the most
 * recent rows and spans several sets — which is why the list needs a
 * cross-show sort at all. A set is one DJ's show, start to finish, whatever
 * length that happens to be. Calling both of them "page" and putting Previous
 * and Next either side would imply a sequence the two halves do not share:
 * stepping "back" from the landing view lands on a set whose last rows are
 * already on screen above.
 *
 * So: from the landing view there is one way out, "Earlier sets". From a set
 * there are two, and the one that returns to the landing view says where it
 * goes rather than calling it the next set.
 *
 * Going further back is never disabled. The endpoint reports an empty set and
 * the end of the archive with the same 404, so a button disabled on that
 * signal would turn one empty show in the middle of the archive into a
 * permanent wall.
 */
function SetNav({page, onGo}) {
	if (page === null) return null
	const isLanding = page === LANDING_VIEW

	return (
		<nav
			aria-label="Move between sets"
			className="mt-6 flex flex-wrap items-center gap-3"
		>
			<button
				type="button"
				onClick={() => onGo(page + 1)}
				className="rounded border border-white/30 px-3 py-1"
			>
				&larr; {isLanding ? 'Earlier sets' : 'Previous set'}
			</button>
			{isLanding ? null : (
				<>
					<span className="text-white/60">
						{page === 1 ? 'One set back' : `${page} sets back`}
					</span>
					<button
						type="button"
						onClick={() => onGo(page - 1)}
						className="rounded border border-white/30 px-3 py-1"
					>
						{page === 1 ? 'Now playing' : 'Next set'} &rarr;
					</button>
				</>
			)}
		</nav>
	)
}

const LivePlaylist = () => {
	const router = useRouter()

	// Null until the router has resolved the query string, which on a static
	// export is empty on the first render and populated after hydration. The
	// archive page gates its week the same way and for the same reason: making
	// "we have not read the URL yet" indistinguishable from "the URL asked for
	// the landing view" sends a request for the landing view on every shared
	// set link, before the set-reading effect's state update lands.
	const [setPage, setSetPage] = useState(null)
	// null until the first fetch resolves, so "no data yet" and "fetched an
	// empty page" are distinguishable.
	const [entries, setEntries] = useState(null)
	// `undefined` until the first fetch resolves and reports a value, matching
	// the API's own three-way `on_air` contract: an object names a live DJ,
	// `null` means the station is confirmed on automation, and an absent key
	// (mirrored here as `undefined`, both before the first response and after
	// one that omits the field) means unknown.
	const [onAir, setOnAir] = useState(undefined)
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
	const isLoading = setPage === null || (entries === null && error === null)
	const isSetView = setPage !== null && setPage !== LANDING_VIEW

	// The query string is empty on the first render of a statically exported
	// page and populated once the router is ready, so the set has to be read
	// then rather than during initialisation.
	useEffect(() => {
		if (!router.isReady) return
		setSetPage(setPageFromQuery(router.query.set))
	}, [router.isReady, router.query.set])

	const goToSet = useCallback(
		(nextSet) => {
			router.push(
				nextSet === LANDING_VIEW ? '/playlist' : `/playlist?set=${nextSet}`,
				undefined,
				{shallow: true}
			)
			// Cleared in the same batch as the navigation so a click repaints
			// once, not twice: without this the commit that flips the heading
			// still holds the old view's rows, and one frame captions one DJ's
			// playlist with another DJ's name.
			//
			// This is an optimisation, not the guarantee. The guarantee is in
			// the two fetch effects, which clear on entry and therefore cover
			// the paths that never reach this function at all — Back, Forward,
			// and any link that lands on a different `?set=`.
			setEntries(null)
			setOnAir(undefined)
			setError(null)
			setSetPage(nextSet)
		},
		[router]
	)

	const load = useCallback(async () => {
		abortControllerRef.current?.abort()
		const controller = new AbortController()
		abortControllerRef.current = controller

		try {
			const data = await fetchRecentFlowsheet({signal: controller.signal})
			if (!Array.isArray(data?.entries)) {
				// A response missing its `entries` array (or carrying a non-array
				// value for it) is a shape regression, not an empty playlist. Left
				// as `data?.entries ?? []`, this would render "Nothing has aired
				// recently" — a confident lie about a live radio station — instead
				// of the loud error state a contract break deserves.
				throw new FlowsheetFetchError(
					'Could not load the playlist (unexpected response shape).'
				)
			}
			// A superseded poll's fetch can still resolve after the one that
			// replaced it. Only apply a response while its request is still the
			// current one.
			if (abortControllerRef.current !== controller) return
			const sortedEntries = [...data.entries].sort(compareEntriesByAirOrderDesc)
			setEntries(sortedEntries)
			setOnAir(data.on_air)
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

	// One whole set, fetched once. Deliberately not polled: an archived set is
	// immutable, and re-requesting it every minute would be pure waste. It is
	// the same reason dj-site keeps `getShowPlaylist` cached for ten minutes.
	useEffect(() => {
		if (setPage === null || setPage === LANDING_VIEW) return

		// Cleared on entry, before the fetch. This runs for every change of
		// `setPage`, not only the ones a button caused — which is the point:
		// Back and Forward change `?set=` through the router-query effect,
		// which calls no handler of ours.
		const controller = new AbortController()
		setEntries(null)
		setOnAir(undefined)
		setError(null)

		fetchSet(setPage, {signal: controller.signal})
			.then((rows) => {
				// Sorted with the same comparator the landing view uses rather
				// than trusting the endpoint's order. Backend orders this branch
				// `desc(play_order), desc(id)`, which for a single set already
				// agrees — but one rule applied to both views beats two rules
				// that happen to agree, since only one of them is ours.
				//
				// Newest-first, so the list does not invert when a reader steps
				// back a set. Deliberately unlike the archive page, which reads
				// a show chronologically; see `fetchSet` for why the reading
				// direction belongs to the page rather than to the set.
				setEntries([...rows].sort(compareEntriesByAirOrderDesc))
			})
			.catch((err) => {
				if (err?.name === 'AbortError') return
				if (err instanceof EmptySetError) {
					// Not an error state. The set is real and simply has no rows
					// — which is also what paging past the oldest show looks
					// like, and the status cannot tell the two apart. So the
					// navigation stays exactly as it was: treating this as the
					// end of the archive would turn one empty show in the middle
					// of it into a permanent wall.
					setEntries([])
					return
				}
				setError(
					err instanceof FlowsheetFetchError
						? err.message
						: 'Could not load that set.'
				)
			})

		return () => controller.abort()
	}, [setPage])

	useEffect(() => {
		if (setPage !== LANDING_VIEW) return

		// Entering the landing view — on first load, from a button, or from
		// Back. Whatever is on screen belongs to a different view, and saying
		// so here rather than only in `goToSet` is what makes the history path
		// safe: `setPage` also changes from the router-query effect above,
		// which runs no handler of ours. Without this, backing out of a set
		// left that set's rows under the "Live Playlist" heading with no
		// spinner for a whole round trip — and, if the set had failed, left
		// its error there too. See #216's third defect, which is this one.
		//
		// Not a poll-time reset: the interval calls `load` directly and never
		// re-runs this effect, so a failed refresh still keeps the last good
		// playlist on screen.
		setEntries(null)
		setOnAir(undefined)
		setError(null)

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

		// Consulted at mount, not only on a later transition: `visibilitychange`
		// never fires for a tab that starts hidden (e.g. opened with a cmd-click)
		// and is never focused, so without this check such a tab would fetch on
		// mount and then poll indefinitely with nobody looking at it. Routing
		// through the same handler that responds to a transition means "start
		// hidden" and "become hidden" are one code path, not two.
		handleVisibilityChange()
		document.addEventListener('visibilitychange', handleVisibilityChange)

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange)
			stopInterval()
			abortControllerRef.current?.abort()
		}
	}, [load, setPage])

	// Derived from the set's own rows: the `shows_limit` branch returns no
	// `shows` metadata, so there is nothing else to build a header from.
	const set = useMemo(
		() => describeSet(isSetView ? entries ?? [] : []),
		[entries, isSetView]
	)
	const setAirTime = formatShowTime({
		startTime: set.startTime,
		endTime: set.endTime,
	})
	const setDate = formatNumericDate(set.startTime)

	const heading = isSetView ? 'Earlier Set' : 'Live Playlist'
	// Composed here rather than interpolated inside the element. A `<title>`
	// may hold only a single text node, and `{heading} | WXYC` hands React an
	// array of two — which it warns about at render time and which makes
	// hydration fall back to client rendering for the whole page. Caught in
	// preview: the set view rendered its server HTML and then never hydrated,
	// so the page sat on "Loading the playlist…" with no rows and no
	// background.

	return (
		<>
			<Head>
				<title>{`${heading} | WXYC`}</title>
				<meta
					name="description"
					content={
						isSetView
							? 'An earlier WXYC 89.3 FM set, start to finish.'
							: 'What WXYC 89.3 FM is playing right now.'
					}
				/>
			</Head>

			<div className="mx-auto w-full px-4 pb-16 sm:w-5/6">
				<ReadableSurface>
					<h1 className="kallisto mb-2 text-5xl">{heading}</h1>
					{isSetView ? (
						<p className="mb-6 text-white/70">
							{/* `UNKNOWN_DJ_LABEL`, not "Unattributed". `lib/flowsheetRange.js`
							    reserves those two words for different facts and says so:
							    unattributed means the rows belong to no show at all,
							    which cannot happen here — this endpoint is addressed by
							    show. What can happen is a show whose handle did not
							    resolve, which is the other one. */}
							<span className="text-white">
								{set.djName ?? UNKNOWN_DJ_LABEL}
							</span>
							{setDate ? ` — ${setDate}` : null}
							{setAirTime ? `, ${setAirTime}` : null}
						</p>
					) : onAir === null ? (
						// Explicit JSON `null`, not an absent key: the backend is
						// confirming the station is on automation, not merely silent
						// about it. See the `onAir` state comment above.
						<p className="mb-6 text-white/70">
							On the air now: <span className="text-white">Auto DJ</span>
						</p>
					) : onAir?.dj_name ? (
						<p className="mb-6 text-white/70">
							On the air now:{' '}
							<span className="text-white">{onAir.dj_name}</span>
						</p>
					) : (
						<p className="mb-6 text-white/70">The most recent songs on WXYC.</p>
					)}

					{/* Rendered once, above the list, and outside every state
					    branch. Above, because on a set that can run to several
					    hundred rows, navigation below the fold is navigation
					    nobody finds. Outside the branches, because it used to be
					    rendered twice — once beside the error and once under the
					    table — which left the loading state with no way out at
					    all, and had an alert region read the controls out along
					    with the failure. Holding still across loading, error and
					    empty also stops them jumping as a set loads. */}
					<SetNav page={setPage} onGo={goToSet} />

					{isLoading ? (
						<p role="status">
							{isSetView ? 'Loading the set…' : 'Loading the playlist…'}
						</p>
					) : error && entries === null ? (
						<>
							<div role="alert">
								<p>{error}</p>
							</div>
						</>
					) : (
						<>
							{error && entries !== null ? (
								<div
									role="status"
									className="mb-4 flex flex-wrap items-center gap-3 border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/70"
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
								<p>
									{isSetView
										? // Reached two ways the endpoint cannot tell apart
											// — a set with no rows, and paging past the
											// oldest show. Both are ordinary, and neither
											// is the end of the archive. See
											// `EmptySetError` in `lib/flowsheet.js`.
											'Nothing was logged for this set.'
										: 'Nothing has aired recently.'}
								</p>
							) : (
								<>
									<MarkerKey />
									<div className="overflow-x-auto">
										<table className="w-full text-left text-sm">
											<thead className="sr-only">
												<tr>
													{COLUMNS.map((column) => (
														<th key={column}>{column}</th>
													))}
												</tr>
											</thead>
											<tbody>
												{(entries ?? []).map((entry) => (
													<PlaylistRow key={entry.id} entry={entry} />
												))}
											</tbody>
										</table>
									</div>
								</>
							)}
						</>
					)}
				</ReadableSurface>
			</div>
		</>
	)
}

export default LivePlaylist
