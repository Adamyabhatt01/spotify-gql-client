import type { KyInstance } from "ky";
import { SpotifyError } from "./error.js";
import type { Page, Playlist, Track } from "../types/web-api.js";

class SpotifyPlaylistEndpoint {
  apiClient!: KyInstance;
  gqlClient!: KyInstance;

  constructor(apiClient: KyInstance, gqlClient: KyInstance) {
    this.apiClient = apiClient;
    this.gqlClient = gqlClient;
  }

  async getPlaylist(playlistId: string): Promise<Playlist> {
    const res = await this.apiClient.get(`playlists/${playlistId}`).json<any>();
    SpotifyError.mayThrow(res);
    return res;
  }

  async tracks(
    playlistId: string,
    { offset = 0, limit = 20 }: { offset?: number; limit?: number } = {}
  ): Promise<Page<Track>> {
    const res = await this.apiClient
      .get(`playlists/${playlistId}/tracks`, {
        searchParams: {
          offset,
          limit,
        },
      })
      .json<any>();

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
      .post(`users/${userId}/playlists`, {
        json: {
          name,
          description,
          public: isPublic,
          collaborative,
        },
      })
      .json<Playlist>();

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
        json: data,
      })
      .json<any>();

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
        json: {
          uris,
          position,
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);
    return res;
  }

  async removeTracks(playlistId: string, { uris }: { uris: string[] }) {
    if (!uris || !playlistId) {
      throw new Error("uris and playlistId are required");
    }

    const res = await this.apiClient
      .delete(`playlists/${playlistId}/tracks`, {
        json: {
          tracks: uris.map((uri) => ({ uri })),
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);
    return res;
  }

  async follow(playlistId: string) {
    const res = await this.apiClient
      .put(`playlists/${playlistId}/followers`, {
        json: {
          public: false,
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);
    return res;
  }

  async unfollow(playlistId: string) {
    const res = await this.apiClient.delete(`playlists/${playlistId}/followers`).json<any>();
    SpotifyError.mayThrow(res);
    return res;
  }
}

export { SpotifyPlaylistEndpoint };