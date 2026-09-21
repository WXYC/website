import ReadableSurface from './ReadableSurface'

/**
 * The alumni-facing landing page for WXYC's 50th anniversary (`/50th`).
 *
 * This is markup only: `pages/50th.jsx` fetches the copy from TinaCMS and
 * hands the rendered body in as `children`. The split is not decoration — the
 * page module imports `tina/__generated__/client`, which is gitignored and
 * does not exist when `npm test` runs (`pr-open.yml` runs the suite before
 * `tinacms build`), so a test that imported the page could not resolve it.
 * Everything worth pinning therefore lives here.
 *
 * The form link is a button in code rather than a link in the CMS copy. The
 * station is emailing this URL to alumni for one reason — to get the database
 * form filled in — and a body edit at /admin must not be able to drop it.
 *
 * The copy sits on `ReadableSurface` for the reason the playlist pages do
 * (WXYC/website#234): white type over the animated WebGL background has no
 * fixed contrast ratio, and this page's own frame put the headline over the
 * shader's palest output. The surface is more warranted here than on the
 * other prose pages, not less — this is the URL the station is sending to
 * alumni who have never seen the site, and a first impression cannot be left
 * to whichever frame the background happened to be painting.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children The rendered CMS body copy.
 * @param {string} [props.bodyField] TinaCMS edit-mode field reference for the
 *   body, from `tinaField(data.page, 'body')`. Absent outside the CMS.
 */

/**
 * UNC short link, not the Little Green Light form it currently redirects to
 * (`secure.lglforms.com/form_engine/s/...`). The short link is what the
 * anniversary committee is putting in print and email, and it can be
 * re-pointed at a different form without a site deploy.
 */
export const ALUMNI_FORM_URL = 'https://go.unc.edu/WXYCAnniversary'

export default function FiftiethAnniversary({children, bodyField}) {
	return (
		<div className="mx-auto flex w-5/6 flex-col items-center pb-16">
			<ReadableSurface className="flex w-full max-w-3xl flex-col items-center">
				<article
					data-tina-field={bodyField}
					className="prose prose-lg text-white prose-h1:font-kallisto prose-h1:text-5xl prose-h1:font-normal prose-h1:text-white prose-h2:font-kallisto prose-h2:font-normal prose-h2:text-white prose-h3:font-normal prose-h3:text-white prose-a:text-blue-500 prose-strong:text-white"
				>
					{children}
				</article>

				<a
					href={ALUMNI_FORM_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-10 flex min-h-16 w-full max-w-md items-center justify-center rounded-3xl bg-gradient-to-b from-neutral-200 to-neutral-400 px-6 py-3 text-center text-xl text-black hover:text-neutral-700"
				>
					Fill out your WXYC alumni information
				</a>
			</ReadableSurface>
		</div>
	)
}
