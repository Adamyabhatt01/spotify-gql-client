import { SpotifyGqlApi } from "../src/index.js";
import { writeFileSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const spTCookie = (process.env ?? (import.meta as any).env)
  .SPOTIFY_SP_T_COOKIE as string;

async function saveResponseToFile(filename: string, data: any): Promise<void> {
  try {
    writeFileSync(
      `${__dirname}/${filename}.json`,
      JSON.stringify(data, null, 2)
    );
    console.log(`✅ ${filename}.json saved`);
  } catch (error) {
    console.error(`❌ Error saving ${filename}.json:`, error);
  }
}

type ApiCall = {
  name: string;
  fn: (client: SpotifyGqlApi) => Promise<any>;
};

const API_CALLS: ApiCall[] = [
  {
    name: "getAlbum",
    fn: (client) => client.album.getAlbum("4aawyAB9vmqN3uQ7FjRGTy"),
  },
  {
    name: "albumReleases",
    fn: (client) => client.album.releases({ limit: 10 }),
  },
  {
    name: "albumTracks",
    fn: (client) =>
      client.album.tracks("4aawyAB9vmqN3uQ7FjRGTy", { limit: 10 }),
  },
  {
    name: "getArtist",
    fn: (client) => client.artist.getArtist("1vCWHaC5f2uS3yhpwWbIA6"),
  },
  {
    name: "artistAlbums",
    fn: (client) =>
      client.artist.albums("1vCWHaC5f2uS3yhpwWbIA6", { limit: 10 }),
  },
  {
    name: "relatedArtists",
    fn: (client) => client.artist.related("1vCWHaC5f2uS3yhpwWbIA6"),
  },
  {
    name: "artistTopTracks",
    fn: (client) => client.artist.topTracks("1vCWHaC5f2uS3yhpwWbIA6"),
  },
  {
    name: "browseHome",
    fn: (client) =>
      client.browse.home({
        spTCookie,
        timeZone: "America/New_York",
        limit: 10,
      }),
  },
  {
    name: "browseHomeSection",
    fn: (client) =>
      client.browse.homeSection("0JQ5DAnM3wGh0gz1MXnu89", {
        spTCookie,
        timeZone: "America/New_York",
        limit: 10,
      }),
  },
  {
    name: "getPlaylist",
    fn: (client) => client.playlist.getPlaylist("37i9dQZF1DXcBWIGoYBM5M"),
  },
  {
    name: "playlistTracks",
    fn: (client) =>
      client.playlist.tracks("37i9dQZF1DXcBWIGoYBM5M", { limit: 10 }),
  },
  {
    name: "searchTracks",
    fn: (client) => client.search.tracks("Imagine Dragons", { limit: 10 }),
  },
  {
    name: "searchAlbums",
    fn: (client) => client.search.albums("Imagine Dragons", { limit: 10 }),
  },
  {
    name: "searchArtists",
    fn: (client) => client.search.artists("Imagine Dragons", { limit: 10 }),
  },
  {
    name: "searchPlaylists",
    fn: (client) =>
      client.search.playlists("Imagine Dragons", { limit: 10 }),
  },
  {
    name: "searchAll",
    fn: (client) => client.search.all("Imagine Dragons", { limit: 10 }),
  },
  {
    name: "getTrack",
    fn: (client) => client.track.getTrack("3n3Ppam7vgaVa1iaRUc9Lp"),
  },
  {
    name: "me",
    fn: (client) => client.user.me(),
  },
  {
    name: "savedAlbums",
    fn: (client) => client.user.savedAlbums(),
  },
  {
    name: "savedArtists",
    fn: (client) => client.user.savedArtists(),
  },
  {
    name: "savedTracks",
    fn: (client) => client.user.savedTracks(),
  },
  {
    name: "savedPlaylists",
    fn: (client) => client.user.savedPlaylists(),
  },
];

async function runAndSaveResponses(client: SpotifyGqlApi): Promise<void> {
  const DELAY = 1000;

  for (const call of API_CALLS) {
    try {
      const data = await call.fn(client);
      await saveResponseToFile(call.name, data);
    } catch (error) {
      console.error(`❌ ${call.name} failed:`, error);
    }
    await sleep(DELAY);
  }
}

async function main() {
  const accessToken = (process.env ?? (import.meta as any).env)
    .SPOTIFY_ACCESS_TOKEN!;
  const client = new SpotifyGqlApi(accessToken);

  await runAndSaveResponses(client);
}

main();
