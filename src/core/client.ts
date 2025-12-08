import { SpotifyAlbumEndpoint } from "./album.js";
import { SpotifyArtistEndpoint } from "./artist.js";
import { SpotifyPlaylistEndpoint } from "./playlist.js";
import { SpotifySearchEndpoint } from "./search.js";
import { SpotifyTrackEndpoint } from "./track.js";
import { SpotifyUserEndpoint } from "./user.js";
import { SpotifyBrowseEndpoint } from "./browse.js";
import { generateRandomUserAgent } from "./utils.js";
import ky, { type KyInstance } from "ky";

export default class SpotifyGqlApi {
  apiClient!: KyInstance;
  gqlClient!: KyInstance;

  album!: SpotifyAlbumEndpoint;
  artist!: SpotifyArtistEndpoint;
  browse!: SpotifyBrowseEndpoint;
  playlist!: SpotifyPlaylistEndpoint;
  search!: SpotifySearchEndpoint;
  track!: SpotifyTrackEndpoint;
  user!: SpotifyUserEndpoint;

  constructor(accessToken: string) {
    this.setAccessToken(accessToken);
  }

  setAccessToken(accessToken: string) {
    const headers: Record<string, string | undefined> = {};
    headers["Authorization"] = `Bearer ${accessToken}`;
    headers["User-Agent"] = generateRandomUserAgent();

    this.apiClient = ky.extend({
      headers: headers,
      prefixUrl: "https://api.spotify.com/v1",
    });
    this.gqlClient = ky.extend({
      prefixUrl: "https://api-partner.spotify.com/pathfinder/v2/query",
      headers: headers,
      hooks: {
        beforeRequest: [
          (request) => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/")) {
              url.pathname = url.pathname.slice(0, -1);
              return new Request(url.toString(), request);
            }
            return request;
          },
        ],
      },
    });

    this.album = new SpotifyAlbumEndpoint(this.apiClient, this.gqlClient);
    this.artist = new SpotifyArtistEndpoint(this.apiClient, this.gqlClient);
    this.browse = new SpotifyBrowseEndpoint(this.apiClient, this.gqlClient);
    this.playlist = new SpotifyPlaylistEndpoint(this.apiClient, this.gqlClient);
    this.search = new SpotifySearchEndpoint(this.apiClient, this.gqlClient);
    this.track = new SpotifyTrackEndpoint(this.apiClient, this.gqlClient);
    this.user = new SpotifyUserEndpoint(this.apiClient, this.gqlClient);
  }
}

export { SpotifyGqlApi };
