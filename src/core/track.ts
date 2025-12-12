import { HttpClient } from "./http-client.js"
import { SpotifyError } from "./error.js";
import type { Track } from "../types/web-api.js";

class SpotifyTrackEndpoint {
  apiClient!: HttpClient;
  gqlClient!: HttpClient;

  constructor(apiClient: HttpClient, gqlClient: HttpClient) {
    this.apiClient = apiClient;
    this.gqlClient = gqlClient;
  }

  async getTrack(trackId: string): Promise<Track> {
    const res = await this.apiClient.get(`tracks/${trackId}`);
    SpotifyError.mayThrow(res);
    return res;
  }

  async save(trackIds: string[]) {
    const res = await this.gqlClient
      .post("query", {
        body: {
          variables: {
            uris: trackIds.map((id) => `spotify:track:${id}`),
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
      ;

    SpotifyError.mayThrow(res);
    return res;
  }

  async unsave(trackIds: string[]) {
    const res = await this.gqlClient
      .post("query", {
        body: {
          variables: {
            uris: trackIds.map((id) => `spotify:track:${id}`),
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
      ;

    SpotifyError.mayThrow(res);
    return res;
  }
}

export { SpotifyTrackEndpoint };