import { apiFetch, getApiBase } from "./api";

// function to get the album cover for each song.
const FILLER_IMAGE = '/CD_1_Filler.jpg';

export default async function getCovers(artist, song, album){
    if (!artist || !album) return FILLER_IMAGE;

    try{
        const results = await apiFetch(
            `/api/releases?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(album)}`
        );
        const cover = results?.[0]?.cover_url;
        return cover ? new URL(cover, getApiBase()).toString() : FILLER_IMAGE;
    }catch(err){
        console.error("[getCovers lib]", err);
        return FILLER_IMAGE;
    }
}