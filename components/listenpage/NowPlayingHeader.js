// This component displays the current show and dj playing, plus a link to the
// past-10-days playlist. Centered on mobile, left-aligned beside the vinyl
// player on desktop.

import Link from "next/link";

export default function NowPlayingHeader({ currentPlaylist = {} }) {

    const show = currentPlaylist.show || {};
    const dj = currentPlaylist.dj || {};

    const djname = show.djname || dj.defdjname || "";
    const title = show.title || "";
    // user ID for the DJ's show-list page; present on the current-playlist payload
    const djId = dj.ID ?? show.userID;

    return(
        <div className="text-center lg:text-left">
            <p className="text-base text-gray-300 tracking-wide">
                Current Show
            </p>
            <h1 className="text-3xl font-light leading-tight break-words">
                DJ:{" "}
                {djId && djname ? (
                    <Link href={`/dj/?id=${djId}`} legacyBehavior={false} className="underline hover:no-underline">
                        {djname}
                    </Link>
                ) : (
                    djname
                )}
            </h1>
            <h4 className="text-xl text-gray-300 mt-1 break-words">
                Show: {title}
            </h4>
            <p className="mt-3">
                <Link href="/listen/past-10-days/" legacyBehavior={false} className="underline hover:no-underline text-gray-300">
                    Past 10 days
                </Link>
            </p>
        </div>
    )
}
