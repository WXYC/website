// privacy policy
const Privacy = () => {
	return (
		<div className="m-5 flex justify-center align-middle">
			<div className="flex-column prose text-white">
				<h1 className="font-kallisto text-5xl font-normal text-white">
					Privacy Policy
				</h1>
				<p className="text-white">Last updated: September 24, 2026</p>
				<h2 className="text-white">1. Introduction</h2>
				<p>
					WXYC is dedicated to respecting the privacy of our listeners and our
					staff. This Privacy Policy explains the data practices of our website
					and of our four mobile apps, which fall into two groups:
				</p>
				<ul>
					<li>
						<strong>The WXYC listener apps</strong> for iOS and Android, which
						stream the station and are open to everyone. They have no accounts
						and no sign-in, and listeners are anonymous to us.
					</li>
					<li>
						<strong>The WXYC DJ apps</strong> for iOS and Android, which are
						internal tools for WXYC station staff. They require a dj.wxyc.org
						account and therefore identify the person using them.
					</li>
				</ul>
				<p>
					Because those two groups differ, each section below says which apps it
					applies to.
				</p>

				<h2 className="text-white">2. Information Collection</h2>
				<h3 className="text-white">Our website and the listener apps</h3>
				<p>
					Our website and our listener apps collect anonymous analytics data to
					help us understand performance and usage trends. This data does not
					include personally identifiable information. You do not create an
					account or sign in to use them.
				</p>
				<h3 className="text-white">The DJ apps</h3>
				<p>
					The DJ apps are used by WXYC station staff, who sign in to them. They
					collect and use the following:
				</p>
				<ul>
					<li>
						<strong>Sign-in identifiers.</strong> A DJ signs in with the
						username or email address of their dj.wxyc.org account, either with
						a password or with a one-time code we mail to the email address
						registered to that account.
					</li>
					<li>
						<strong>Session credentials.</strong> After a successful sign-in,
						the app holds a session token and an access token. The access token
						carries the DJ&apos;s account id, email address, and role at the
						station.
					</li>
					<li>
						<strong>Per-DJ records.</strong> A DJ&apos;s bin — the albums they
						have set aside for a show — is stored against their account on WXYC
						servers so that it is available on every device they sign in to.
					</li>
					<li>
						<strong>Library searches.</strong> What a DJ types into library
						search is sent to WXYC servers to return results. It is not sent to
						any third party, and it is not included in analytics or error
						reports.
					</li>
				</ul>

				<h2 className="text-white">3. Data Usage</h2>
				<p>
					The anonymous analytics data we collect is used solely for improving
					our services, including app performance and user experience. For our
					website and our listener apps, no personally identifiable information
					is collected at all.
				</p>
				<p>
					The information the DJ apps collect is used solely to sign a DJ in and
					to provide the station features they sign in for. It is not used for
					marketing or advertising. On every surface described in this policy,
					WXYC does not sell your data, and does not share it with third parties
					for advertising.
				</p>

				<h2 className="text-white">4. Data Storage and Retention</h2>
				<p>
					A DJ app&apos;s session and access tokens are held only in encrypted
					storage on the device itself — the iOS Keychain, restricted to that
					one device and never synchronized to iCloud, and encrypted storage on
					Android that is excluded from cloud backup and from device-to-device
					transfer. Signing out or uninstalling the app removes them from the
					device.
				</p>
				<p>
					Account records and a DJ&apos;s bin are retained on WXYC servers for
					as long as the account is active. To ask about or request deletion of
					a staff account and its associated data, write to us at the address in
					section 7.
				</p>

				<p>
					All communication between our apps and WXYC servers takes place over
					encrypted connections.
				</p>

				<h2 className="text-white">5. Third-Party Services</h2>
				<p>
					We use{' '}
					<a href="https://posthog.com/" className="text-white">
						PostHog
					</a>{' '}
					to collect and analyze anonymous analytics data on our website, on
					both listener apps, and in the iOS DJ app. In the DJ app it is
					configured so that no personal profile is ever created and IP
					addresses are not retained. No personally identifiable information is
					shared with PostHog.
				</p>
				<p>
					We use{' '}
					<a href="https://sentry.io/" className="text-white">
						Sentry
					</a>{' '}
					for error and crash reporting in the iOS listener app and the iOS DJ
					app. In the DJ app, error reports are deliberately anonymous: they
					carry no username, email address, account id, or role; no screenshots,
					no recording of the screen, and no IP address; and web addresses are
					stripped of everything a DJ may have typed before a report leaves the
					device. Reports do carry a random identifier generated on the device
					for the install itself, which is not linked to any WXYC account.
				</p>
				<p>
					<strong>
						The Android DJ app sends no analytics and no error or crash reports
						of any kind.
					</strong>{' '}
					It communicates only with WXYC servers, to sign in and to provide the
					features described above.
				</p>

				<h2 className="text-white">6. Changes to This Privacy Policy</h2>
				<p>
					We may update our Privacy Policy from time to time. We will notify you
					of any changes by posting the new Privacy Policy on this page.
				</p>

				<h2 className="text-white">7. Contact Us</h2>
				<p>
					If you have any questions about this Privacy Policy, please contact us
					at{' '}
					<a className="text-white" href="mailto:privacy@wxyc.org">
						privacy@wxyc.org
					</a>
					.
				</p>
			</div>
		</div>
	)
}

export default Privacy
