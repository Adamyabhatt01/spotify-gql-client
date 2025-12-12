import { SpotifyAlbumEndpoint } from "./album.js";
import { SpotifyArtistEndpoint } from "./artist.js";
import { SpotifyPlaylistEndpoint } from "./playlist.js";
import { SpotifySearchEndpoint } from "./search.js";
import { SpotifyTrackEndpoint } from "./track.js";
import { SpotifyUserEndpoint } from "./user.js";
import { SpotifyBrowseEndpoint } from "./browse.js";
import { generateRandomUserAgent } from "./utils.js";
import { HttpClient } from "./http-client.js";

export default class SpotifyGqlApi {
  apiClient!: HttpClient;
  gqlClient!: HttpClient;

  album!: SpotifyAlbumEndpoint;
  artist!: SpotifyArtistEndpoint;
  browse!: SpotifyBrowseEndpoint;
  playlist!: SpotifyPlaylistEndpoint;
  search!: SpotifySearchEndpoint;
  track!: SpotifyTrackEndpoint;
  user!: SpotifyUserEndpoint;

  constructor(accessToken?: string | null) {
    this.setAccessToken(accessToken);
  }

  setAccessToken(accessToken: string | null | undefined) {
    const headers: Record<string, string | undefined> = {};
    headers["Authorization"] = `Bearer ${accessToken}`;
    headers["User-Agent"] = generateRandomUserAgent();

    this.apiClient = new HttpClient({
      headers: headers,
      baseURL: "https://api.spotify.com/v1/",
    });
    this.gqlClient = new HttpClient({
      baseURL: "https://api-partner.spotify.com/pathfinder/v2/",
      headers: headers,
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
