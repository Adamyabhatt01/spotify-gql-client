import type { KyInstance } from "ky";
import { SpotifyError } from "./error.js";
import type { Album, Artist, Page, TopTracksResult } from "../types/web-api.js";

class SpotifyArtistEndpoint {
  apiClient!: KyInstance;
  gqlClient!: KyInstance;

  constructor(apiClient: KyInstance, gqlClient: KyInstance) {
    this.apiClient = apiClient;
    this.gqlClient = gqlClient;
  }

  async getArtist(artistId: string): Promise<Artist> {
    const res = await this.apiClient.get(`artists/${artistId}`).json<any>();
    SpotifyError.mayThrow(res);
    return res;
  }

  async topTracks(artistId: string): Promise<TopTracksResult> {
    const res = await this.apiClient
      .get(`artists/${artistId}/top-tracks`)
      .json<any>();
    SpotifyError.mayThrow(res);
    return res;
  }

  async albums(
    artistId: string,
    { limit, offset }: { limit?: number; offset?: number } = {}
  ): Promise<Page<Album>> {
    const res = await this.apiClient
      .get(`artists/${artistId}/albums`, {
        searchParams: {
          limit,
          offset,
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);
    return res;
  }

  async follow(artistIds: string[]) {
    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            uris: artistIds.map((id) => `spotify:artist:${id}`),
          },
          operationName: "addToLibrary",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "a3c1ff58e6a36fec5fe1e3a193dc95d9071d96b9ba53c5ba9c1494fb1ee73915",
            },
          },
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);
    return res;
  }

  async unfollow(artistIds: string[]) {
    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            uris: artistIds.map((id) => `spotify:artist:${id}`),
          },
          operationName: "removeFromLibrary",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "a3c1ff58e6a36fec5fe1e3a193dc95d9071d96b9ba53c5ba9c1494fb1ee73915",
            },
          },
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);
    return res;
  }

  async related(artistId: string): Promise<Artist[]> {
    const res = await this.apiClient
      .get(`artists/${artistId}/related-artists`)
      .json<any>();
    SpotifyError.mayThrow(res);
    return res.artists;
  }
}

export { SpotifyArtistEndpoint };
