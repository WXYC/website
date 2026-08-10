import React, {useCallback, useEffect, useMemo, useState} from 'react'
import Head from 'next/head'
import {useRouter} from 'next/router'
import {
	EARLIEST_ARCHIVE_DATE,
	addDays,
	easternToday,
	formatCalendarDate,
	startOfWeek,
} from '../../lib/easternTime'
import {
	describeNonTrackEntry,
	fetchFlowsheetRange,
	formatShowTime,
	groupRangeByDay,
	isTrack,
} from '../../lib/flowsheetRange'

/**
 * Public historical playlist archive — the successor to
 * `wxyc.info/playlists/radioWeek`, which dies at the 2026-08-31 tubafrenzy
 * cutover.
 *
 * The week is chosen client-side and reflected in `?week=YYYY-MM-DD` (always a
 * Monday) so a given week is linkable. It has to be the query string rather than
 * a path segment: this site is a static export with no SSR and no
 * `getStaticPaths`, and there is no sane way to pre-render a page per week back
 * to 2004 over a 2.6-million-row table. Query parameters resolve after
 * hydration, which costs nothing here because the data is fetched client-side
 * anyway.
 */

const DAYS_PER_WEEK = 7

/** Query-string week parameter, validated. Anything else falls back to today. */
function weekFromQuery(value) {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return null
	}
	// Reject a well-formed but nonexistent date (2026-02-31) before it becomes a
	// silently-shifted window.
	const [y, m, d] = value.split('-').map(Number)
	const parsed = new Date(Date.UTC(y, m - 1, d))
	if (
		parsed.getUTCFullYear() !== y ||
		parsed.getUTCMonth() !== m - 1 ||
		parsed.getUTCDate() !== d
	) {
		return null
	}
	return startOfWeek(value)
}

function EntryRow({entry}) {
	if (!isTrack(entry)) {
		const message = describeNonTrackEntry(entry)
		return (
			<tr>
				<td
					colSpan={5}
					className="bg-white/5 px-3 py-1 text-center text-xs uppercase tracking-wide text-white/50"
				>
					{message}
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

/**
 * One show, as a collapsible block: the schedule line is always visible and the
 * playlist opens in place.
 *
 * `<details>` rather than a state-driven toggle, and closed by default, for a
 * reason that is measurement rather than taste. A week is 2,300–2,800 entries
 * and 470–640 KB gzipped in production, so rendering every playlist expanded
 * puts a couple of thousand table rows through layout on what is a phone-first
 * listener surface. A closed `<details>` keeps its content in the DOM — so it is
 * still searchable by the browser's find, and still assertable in tests — while
 * the browser skips laying it out.
 *
 * It also happens to be the shape of the page this replaces: `radioWeek` showed
 * the week's schedule and drilled into `radioShow?radioShowID=…` for a playlist.
 * Here the drill-in costs no navigation and no second request.
 */
function ShowBlock({show}) {
	const airTime = formatShowTime(show)
	const trackCount = show.entries.filter(isTrack).length
	return (
		<details className="mb-2 border-b border-white/10 pb-2">
			<summary className="cursor-pointer text-lg font-semibold">
				{show.djName}
				{show.showName ? (
					<span className="font-normal text-white/60"> — {show.showName}</span>
				) : null}
				{airTime ? (
					<span className="ml-2 text-sm font-normal text-white/50">
						{airTime}
					</span>
				) : null}
				<span className="ml-2 text-sm font-normal text-white/40">
					{trackCount} {trackCount === 1 ? 'track' : 'tracks'}
				</span>
			</summary>
			<div className="mt-2 overflow-x-auto">
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
						{show.entries.map((entry) => (
							<EntryRow key={entry.id} entry={entry} />
						))}
					</tbody>
				</table>
			</div>
		</details>
	)
}

function DayBlock({day}) {
	return (
		<div className="mb-10">
			<h2 className="mb-3 border-b border-white/20 pb-1 text-2xl">
				{formatCalendarDate(day.date)}
			</h2>
			{day.shows.length === 0 ? (
				<p className="text-white/50">No playlists recorded for this day.</p>
			) : (
				day.shows.map((show, index) => (
					<ShowBlock key={show.id ?? `unattributed-${index}`} show={show} />
				))
			)}
		</div>
	)
}

const ArchivePlaylists = () => {
	const router = useRouter()
	const today = useMemo(() => easternToday(), [])
	const currentWeek = useMemo(() => startOfWeek(today), [today])

	const [week, setWeek] = useState(currentWeek)
	const [days, setDays] = useState(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState(null)
	// Bumped by Retry. A plain re-set of `week` would be a no-op — React bails
	// out of a state update to an identical value, so the fetch effect would
	// never re-run.
	const [reloadToken, setReloadToken] = useState(0)

	// The query string is empty on the first render of a statically exported
	// page and populated once the router is ready, so the week has to be read
	// then rather than during initialisation.
	useEffect(() => {
		if (!router.isReady) return
		setWeek(weekFromQuery(router.query.week) ?? currentWeek)
	}, [router.isReady, router.query.week, currentWeek])

	useEffect(() => {
		const controller = new AbortController()
		setIsLoading(true)
		setError(null)

		fetchFlowsheetRange(week, DAYS_PER_WEEK, {signal: controller.signal})
			.then((range) => {
				setDays(groupRangeByDay(range, week, DAYS_PER_WEEK))
				setIsLoading(false)
			})
			.catch((err) => {
				if (err.name === 'AbortError') return
				setError(err.message || 'Could not load playlists.')
				setDays(null)
				setIsLoading(false)
			})

		return () => controller.abort()
	}, [week, reloadToken])

	const goToWeek = useCallback(
		(nextWeek) => {
			router.push(`/playlists/archive?week=${nextWeek}`, undefined, {
				shallow: true,
			})
			setWeek(nextWeek)
		},
		[router]
	)

	const previousWeek = addDays(week, -DAYS_PER_WEEK)
	const nextWeek = addDays(week, DAYS_PER_WEEK)
	// The window is a fixed 7 days, so it can never exceed the endpoint's 8-day
	// ceiling. What it can do is run off the ends of the archive, which is what
	// these bound.
	const canGoBack = previousWeek >= startOfWeek(EARLIEST_ARCHIVE_DATE)
	const canGoForward = nextWeek <= currentWeek

	const totalTracks = useMemo(
		() =>
			(days ?? []).reduce(
				(sum, day) =>
					sum +
					day.shows.reduce(
						(showSum, show) => showSum + show.entries.filter(isTrack).length,
						0
					),
				0
			),
		[days]
	)

	return (
		<>
			<Head>
				<title>Playlist Archive | WXYC</title>
				<meta
					name="description"
					content="Browse WXYC playlists week by week, going back to 2004."
				/>
			</Head>

			<div className="mx-auto w-full px-4 pb-16 sm:w-5/6">
				<h1 className="kallisto mb-2 text-5xl">Playlist Archive</h1>
				<p className="mb-6 text-white/70">
					Every show WXYC has logged, week by week. Use the date picker to jump
					anywhere back to 2004.
				</p>

				<div className="mb-8 flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={() => goToWeek(previousWeek)}
						disabled={!canGoBack}
						className="rounded border border-white/30 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
					>
						← Previous week
					</button>
					<label className="flex items-center gap-2">
						<span className="sr-only">Jump to a date</span>
						<input
							type="date"
							value={week}
							min={EARLIEST_ARCHIVE_DATE}
							max={today}
							onChange={(event) => {
								const picked = weekFromQuery(event.target.value)
								if (picked) goToWeek(picked)
							}}
							className="rounded border border-white/30 bg-transparent px-2 py-1"
						/>
					</label>
					<button
						type="button"
						onClick={() => goToWeek(nextWeek)}
						disabled={!canGoForward}
						className="rounded border border-white/30 px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
					>
						Next week →
					</button>
				</div>

				<h2 className="mb-6 text-xl text-white/80">
					Week of {formatCalendarDate(week, {weekday: undefined})}
					{!isLoading && !error ? (
						<span className="ml-2 text-base text-white/50">
							{totalTracks} {totalTracks === 1 ? 'track' : 'tracks'}
						</span>
					) : null}
				</h2>

				{isLoading ? (
					<p role="status">Loading playlists…</p>
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
				) : days && days.every((day) => day.shows.length === 0) ? (
					<p>No playlists were recorded this week.</p>
				) : (
					(days ?? []).map((day) => <DayBlock key={day.date} day={day} />)
				)}
			</div>
		</>
	)
}

export default ArchivePlaylists
