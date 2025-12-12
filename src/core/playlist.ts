import { HttpClient } from "./http-client.js"
import { SpotifyError } from "./error.js";
import type { Page, Playlist, Track } from "../types/web-api.js";

class SpotifyPlaylistEndpoint {
  apiClient!: HttpClient;
  gqlClient!: HttpClient;

  constructor(apiClient: HttpClient, gqlClient: HttpClient) {
    this.apiClient = apiClient;
    this.gqlClient = gqlClient;
  }

  async getPlaylist(playlistId: string): Promise<Playlist> {
    const res = await this.apiClient.get(`playlists/${playlistId}`);
    SpotifyError.mayThrow(res);
    return res;
  }

  async tracks(
    playlistId: string,
    { offset = 0, limit = 20 }: { offset?: number; limit?: number } = {}
  ): Promise<Page<Track>> {
    const res = await this.apiClient
      .get(`playlists/${playlistId}/tracks`, {
        params: {
          offset,
          limit,
        },
      })
      ;

    SpotifyError.mayThrow(res);
    return res;
  }

  async create(
    userId: string,
    {
      name,
      description,
      public: isPublic = false,
      collaborative = false,
    }: {
      name: string;
      description?: string;
      public?: boolean;
      collaborative?: boolean;
    }
  ): Promise<Playlist> {
    if (!name || !userId) {
      throw new Error("name and userId are required");
    }

    const res = await this.apiClient
      .post<Playlist>(`users/${userId}/playlists`, {
        body: {
          name,
          description,
          public: isPublic,
          collaborative,
        },
      });

    SpotifyError.mayThrow(res);
    return res;
  }

  async update(
    playlistId: string,
    {
      name,
      description,
      public: isPublic,
      collaborative,
    }: {
      name?: string | undefined;
      description?: string | undefined;
      public?: boolean | undefined;
      collaborative?: boolean | undefined;
    }
  ): Promise<void> {
    if (!name || !playlistId) {
      throw new Error("name and playlistId are required");
    }

    const data: Record<string, any> = {
      name,
    };

    if (description !== undefined) {
      data.description = description;
    }
    if (isPublic !== undefined) {
      data.public = isPublic;
    }
    if (collaborative !== undefined) {
      data.collaborative = collaborative;
    }

    const res = await this.apiClient
      .put(`playlists/${playlistId}`, {
        body: data,
      })
      ;

    SpotifyError.mayThrow(res);
  }

  async addTracks(
    playlistId: string,
    { uris, position = 0 }: { uris: string[]; position?: number }
  ) {
    if (!uris || !playlistId) {
      throw new Error("uris and playlistId are required");
    }

    const res = await this.apiClient
      .post(`playlists/${playlistId}/tracks`, {
        body: {
          uris,
          position,
        },
      })
      ;

    SpotifyError.mayThrow(res);
    return res;
  }

  async removeTracks(playlistId: string, { uris }: { uris: string[] }) {
    if (!uris || !playlistId) {
      throw new Error("uris and playlistId are required");
    }

    const res = await this.apiClient
      .delete(`playlists/${playlistId}/tracks`, {
        body: {
          tracks: uris.map((uri) => ({ uri })),
        },
      })
      ;

    SpotifyError.mayThrow(res);
    return res;
  }

  async follow(playlistId: string) {
    const res = await this.apiClient
      .put(`playlists/${playlistId}/followers`, {
        body: {
          public: false,
        },
      })
      ;

    SpotifyError.mayThrow(res);
    return res;
  }

  async unfollow(playlistId: string) {
    const res = await this.apiClient.delete(`playlists/${playlistId}/followers`);
    SpotifyError.mayThrow(res);
    return res;
  }
}

export { SpotifyPlaylistEndpoint };