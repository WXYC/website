<p>A statically generated site for WXYC. Built using the frontend framework React, NextJs as a static site generator and TinaCMS as a Git-based content management system. Styled using TailwindCSS, with help from the MUI Joy UI component library on implementing breadcrumbs and Headless UI on implementing dropdown menus. Deployed to Github Pages.</p>

<p>Supports content management for the radio station's blog and for an archive of the radio station's specialty shows and live events. Very much a work in progress!</p>

<a href="https://wxyc.org/" target="_blank"> Visit live site</a>

<br/>

<img width="1146" alt="image" src="https://github.com/haowens/website/assets/69762131/75c67f8a-f69b-4d54-934d-ce528c9c6964">
<p>[the development of this site is brought to you by the easily accessible assortment of photos of Adrianne Lenker that live on my desktop]</p>

<h3>Playlist archive (<code>/playlists/archive</code>)</h3>
<p>Public, week-at-a-time browse of every show WXYC has logged, back to at least November 2004. Successor to <code>wxyc.info/playlists/radioWeek</code>, which goes dark at the 2026-08-31 tubafrenzy cutover (<a href="https://github.com/WXYC/wiki/issues/93">WXYC/wiki#93</a>).</p>
<ul>
<li><b>Data source</b>: Backend-Service <code>GET /flowsheet/range?start=&amp;end=</code> (epoch milliseconds, half-open <code>[start, end)</code>, 8-day ceiling). Contract lives in <code>wxyc-shared/api.yaml</code>. Override the origin at build time with <code>NEXT_PUBLIC_WXYC_API_URL</code>; it defaults to <code>https://api.wxyc.org</code>.</li>
<li><b>Client-side only.</b> This site is a static export, so there is no SSR and no <code>getStaticPaths</code> over a 2.6-million-row table. The week lives in <code>?week=YYYY-MM-DD</code> (always a Monday) so a week is linkable, and the fetch happens after hydration.</li>
<li><b>Weeks and days are Eastern</b>, not UTC and not browser-local &mdash; see <code>lib/easternTime.js</code>. Day and week bounds are computed by calendar arithmetic rather than by adding fixed millisecond offsets, because the spring-forward week is 167 hours and the fall-back week is 169.</li>
<li><b>Playlists are collapsed by default.</b> A week is 2,300&ndash;2,800 entries and 470&ndash;640&nbsp;KB gzipped, so each show is a <code>&lt;details&gt;</code>: the schedule is always visible and the rows only get laid out when opened. Note that the rows are still <i>built</i> &mdash; <code>&lt;details&gt;</code> skips layout, not DOM construction. Deferring construction to first open is the next lever if the page ever feels slow on a phone.</li>
<li><b>Entries are ordered by <code>play_order</code>, not by arrival.</b> The endpoint returns rows in <code>add_time</code> order, and the two disagree whenever a DJ enters a row after the fact &mdash; 88 times across 36 of the 54 shows in a sampled production week. Ordering by arrival strands retroactively-added hour breakpoints in the middle of a later hour.</li>
<li><b>Past weeks are cached in memory</b> (<code>lib/weekCache.js</code>). The endpoint sends no <code>Cache-Control</code>, so without this every Previous/Next click and every browser Back re-downloads half a megabyte. The week in progress is deliberately never cached.</li>
<li><b>The requested week is clamped</b> to <code>[2004-11-01, current week]</code>. <code>?week=</code> accepts anything, and <code>&lt;input type="date"&gt;</code> reports every keystroke of a typed year (editing to 2026 emits 0002, 0020, 0202 first), so without a clamp each of those becomes a live range query against a 2.6-million-row table.</li>
</ul>

<h3>Live playlist (<code>/playlist</code>)</h3>
<p>Public view of the most recent flowsheet entries, refreshing while the tab stays open. Successor to <code>wxyc.info/playlists/recent</code>, which goes dark at the 2026-08-31 tubafrenzy cutover (<a href="https://github.com/WXYC/wiki/issues/93">WXYC/wiki#93</a>).</p>
<ul>
<li><b>Data source</b>: Backend-Service <code>GET /flowsheet?page=0&amp;limit=50</code>. Distinct from the archive's <code>/flowsheet/range</code>: this endpoint returns one flat <code>entries</code> array plus pagination metadata and the currently on-air DJ, rather than a separate <code>shows</code> array, so there is no grouping step. Contract lives in <code>wxyc-shared/api.yaml</code>. Override the origin at build time with <code>NEXT_PUBLIC_WXYC_API_URL</code>; it defaults to <code>https://api.wxyc.org</code>.</li>
<li><b>Client-side only</b>, for the same reason as the archive: a static export has no SSR and no server to poll from, so the fetch happens in the browser, on an interval, for as long as the tab stays open.</li>
<li><b>Entries are ordered by <code>show_id</code> then <code>play_order</code>, both descending, then <code>id</code> descending</b> &mdash; most recent show first, and within a show by the DJ's stated air order rather than the order the endpoint returned them in (insertion order). The endpoint returns rows newest-inserted-first, and a DJ who enters a row after the fact gets a row whose <code>id</code> says "just now" but whose <code>play_order</code> says otherwise; rendering in insertion order strands it in the wrong place. The <code>id</code> tie-break exists because <code>play_order</code> can legitimately collide &mdash; the tubafrenzy webhook and the dj-site live-insert path assign it independently with no per-show UNIQUE constraint &mdash; matching how Backend's own <code>getEntriesByShow</code> breaks the same tie. See <code>compareEntriesByAirOrderDesc</code> in <code>lib/flowsheetRange.js</code>, shared with the archive page's own <code>play_order</code> rule.</li>
<li><b>A failed poll keeps the last good playlist on screen</b> rather than replacing it with an error: the table is still true, just stale. A "Last updated HH:MM &mdash; couldn't refresh" notice and a Retry button appear alongside it so the page is never silently frozen; only a failure on the very first load (nothing to show yet) replaces the page with a full error state.</li>
<li><b>Polling pauses while the tab is hidden</b> and catches up with one fetch when it becomes visible again, rather than continuing to poll a tab nobody is looking at. The response is ~51&nbsp;KB with <code>Cache-Control: no-cache</code>, and a tab left open for a workday would otherwise issue roughly 1,440 requests for ~73&nbsp;MB.</li>
<li>Each poll aborts any still-in-flight one before starting, so a slow earlier response landing after a faster later one cannot overwrite fresher data with stale.</li>
</ul>

<h3>DNS &amp; hosting (do not "fix" the Pages domain warning)</h3>
<p><code>wxyc.org</code> and <code>www.wxyc.org</code> are proxied through Cloudflare (orange-cloud) rather than pointing their DNS records directly at GitHub Pages. Cloudflare forwards the <code>Host</code> header to GitHub Pages as the origin, so the site is still built and served by this repo's Pages deploy exactly as before &mdash; Cloudflare just sits in front of it (this is what lets us attach edge Workers to the apex).</p>
<p>Because the public A/AAAA records no longer resolve to GitHub's Pages IPs (they resolve to Cloudflare's edge), <b>repo Settings &rarr; Pages will show a warning that the custom domain's DNS does not point at GitHub Pages.</b> This warning is expected and cosmetic &mdash; the site works. <b>Do not change the DNS records back to GitHub's IPs, and do not clear the custom-domain field in Settings &rarr; Pages</b> (the custom domain lives only there; there is no <code>CNAME</code> file in the repo). Reverting either would break the Cloudflare proxy in front of the apex. If you need to take Cloudflare out of the path, toggle the apex + <code>www</code> records from orange (Proxied) back to gray (DNS only) in the Cloudflare dashboard.</p>

<h3>Wishlist</h3>
<ul>
<li>Setlist component for blog posts</li>
<li>
Contact form and instagram integrations (implemented in development, need to figure out how to host)
</li>
<li>Search bar for archive and blog</li>
<li>Utilize Tina blocks to make more components of site editable by admin</li>
<li>Embed audio player in layout so music can continue as you browse the site</li>
</ul>
