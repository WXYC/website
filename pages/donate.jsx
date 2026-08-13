import Head from 'next/head'

// Donate page — the landing destination the iOS and Android apps bake in at
// compile time as their fallback donate URL (https://wxyc.org/donate). It has
// to exist before either app ships, even though the SEB board has not yet
// picked a donation platform. There is deliberately no payment button here:
// once the board decides, a payment link or embed can be added to this page
// without an app release.
const Donate = () => {
	return (
		<>
			<Head>
				<title>Donate | WXYC</title>
				<meta
					name="description"
					content="Support WXYC 89.3 FM, Chapel Hill's student-run, freeform radio station."
				/>
			</Head>

			<div className="mx-auto w-full px-4 pb-16 sm:w-5/6">
				<h1 className="kallisto mb-6 text-5xl">Donate</h1>

				<div className="prose prose-lg max-w-none text-white">
					<p>
						WXYC 89.3 FM has been Chapel Hill&apos;s student-run, freeform radio
						station since 1977, powered by student DJs and listener support.
					</p>

					<p>
						Your donation supports station operations: maintaining our broadcast
						equipment, growing our music library, and keeping WXYC 89.3 FM
						broadcasting.
					</p>

					<p>
						Donations to WXYC go to Student Educational Broadcasting, Inc.
						(SEB), the North Carolina nonprofit that holds WXYC&apos;s broadcast
						license — not to the University of North Carolina at Chapel Hill.
					</p>

					{/*
						The ask and the non-deductibility disclosure below sit adjacent to
						one another, in matching type size, directly above the future
						payment area — the federal safe-harbor placement for a
						non-deductibility statement. Keep them adjacent if this section is
						ever reordered.
					*/}
					<p>
						Please consider making a gift to Student Educational Broadcasting,
						Inc. to support WXYC.
					</p>
					{/*
						PENDING CPA SIGN-OFF: draft wording only. Replace verbatim once
						SEB's accountant/counsel approves the final language. Do not adjust
						size, placement, or wording without that sign-off.
					*/}
					<p>
						Student Educational Broadcasting, Inc. is not a 501(c)(3) tax-exempt
						organization. Contributions are not deductible as charitable
						contributions for federal income tax purposes.
					</p>

					{/*
						No payment button yet — the SEB board has not chosen a donation
						platform. This is where the payment link or embed will go once
						that decision lands.
					*/}
				</div>
			</div>
		</>
	)
}

export default Donate
