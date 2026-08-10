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
<li><b>Playlists are collapsed by default.</b> A week is 2,300&ndash;2,800 entries and 470&ndash;640&nbsp;KB gzipped, so each show is a <code>&lt;details&gt;</code>: the schedule is always visible and the rows only get laid out when opened.</li>
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
