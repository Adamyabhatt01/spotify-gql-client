import type { KyInstance } from "ky";
import { SpotifyError } from "./error.js";
import type {
  GqlAlbum,
  GqlArtist,
  GqlPage,
  GqlPlaylistSimplified,
} from "../types/gql-api.js";
import type { Album, Artist, Track } from "../types/web-api.js";

class SpotifyUserEndpoint {
  apiClient!: KyInstance;
  gqlClient!: KyInstance;

  constructor(apiClient: KyInstance, gqlClient: KyInstance) {
    this.apiClient = apiClient;
    this.gqlClient = gqlClient;
  }

  async me() {
    return await this.apiClient.get("me").json<any>();
  }

  async savedTracks({
    offset = 0,
    limit = 20,
  }: { offset?: number; limit?: number } = {}): Promise<GqlPage<Track>> {
    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            offset,
            limit,
          },
          operationName: "fetchLibraryTracks",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240",
            },
          },
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);

    const trackData = res.data.me.library.tracks.items;
    const onlyTrackIds = trackData
      .filter((track: any) => track.__typename === "UserLibraryTrackResponse")
      .map((track: any) => track.track._uri.split(":").pop());

    const pagingInfo = res.data.me.library.tracks.pagingInfo;

    if (onlyTrackIds.length === 0) {
      return {
        offset: pagingInfo.offset,
        limit: pagingInfo.limit,
        total: res.data.me.library.tracks.totalCount,
        items: [],
      };
    }

    const tracksRes = await this.apiClient
      .get("tracks", {
        searchParams: { ids: onlyTrackIds.join(",") },
      })
      .json<any>();

    return {
      offset: pagingInfo.offset,
      limit: pagingInfo.limit,
      total: res.data.me.library.tracks.totalCount,
      items: tracksRes.tracks,
    };
  }

  async savedPlaylists({
    offset = 0,
    limit = 20,
  }: { offset?: number; limit?: number } = {}): Promise<
    GqlPage<GqlPlaylistSimplified>
  > {
    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            filters: ["Playlists"],
            order: null,
            textFilter: "",
            features: [
              "LIKED_SONGS",
              "YOUR_EPISODES_V2",
              "PRERELEASES",
              "EVENTS",
            ],
            limit,
            offset,
            flatten: false,
            expandedFolders: [],
            folderUri: null,
            includeFoldersWhenFlattening: true,
          },
          operationName: "libraryV3",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "2de10199b2441d6e4ae875f27d2db361020c399fb10b03951120223fbed10b08",
            },
          },
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);

    const playlistData = res.data.me.libraryV3;
    const pagingInfo = playlistData.pagingInfo;

    const items = playlistData.items
      .filter(
        (item: any) =>
          item.item.__typename === "PlaylistResponseWrapper" &&
          item.item.data.__typename === "Playlist"
      )
      .map((item: any) => {
        const id = item.item._uri.split(":").pop();
        const playlist = item.item.data;
        const ownerV2 = playlist.ownerV2.data;

        return {
          id,
          description: playlist.description,
          external_urls: {
            spotify: `https://open.spotify.com/playlist/${id}`,
          },
          images:
            playlist.images?.items.flatMap((image: any) => image.sources) ?? [],
          name: playlist.name,
          owner: {
            type: "User",
            external_urls: {
              spotify: `https://open.spotify.com/user/${ownerV2.id}`,
            },
            id: ownerV2.id,
            uri: ownerV2.uri,
            display_name: ownerV2.name,
            images: ownerV2.avatar?.sources ?? [],
          },
          uri: item.item._uri,
          objectType: "Playlist",
        } satisfies GqlPlaylistSimplified;
      });

    return {
      limit: pagingInfo.limit,
      offset: pagingInfo.offset,
      total: playlistData.totalCount,
      items,
    };
  }

  async savedAlbums({
    offset = 0,
    limit = 20,
  }: { offset?: number; limit?: number } = {}): Promise<GqlPage<Album>> {
    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            filters: ["Albums"],
            order: null,
            textFilter: "",
            features: [
              "LIKED_SONGS",
              "YOUR_EPISODES_V2",
              "PRERELEASES",
              "EVENTS",
            ],
            limit,
            offset,
            flatten: false,
            expandedFolders: [],
            folderUri: null,
            includeFoldersWhenFlattening: true,
          },
          operationName: "libraryV3",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "2de10199b2441d6e4ae875f27d2db361020c399fb10b03951120223fbed10b08",
            },
          },
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);

    const albumsData = res.data.me.libraryV3;
    const pagingInfo = albumsData.pagingInfo;

    const ids = albumsData.items
      .filter(
        (item: any) =>
          item.item.__typename === "AlbumResponseWrapper" &&
          item.item.data.__typename === "Album"
      )
      .map((item: any) => item.item._uri.split(":").pop());

    if (ids.length === 0) {
      return {
        offset: pagingInfo.offset,
        limit: pagingInfo.limit,
        total: albumsData.totalCount,
        items: [],
      };
    }

    const albumsRes = await this.apiClient
      .get("albums", {
        searchParams: { ids: ids.join(",") },
      })
      .json<any>();

    SpotifyError.mayThrow(albumsRes);

    return {
      offset: pagingInfo.offset,
      limit: pagingInfo.limit,
      total: albumsData.totalCount,
      items: albumsRes.albums,
    };
  }

  async savedArtists({
    offset = 0,
    limit = 20,
  }: { offset?: number; limit?: number } = {}): Promise<GqlPage<Artist>> {
    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            filters: ["Artists"],
            order: null,
            textFilter: "",
            features: [
              "LIKED_SONGS",
              "YOUR_EPISODES_V2",
              "PRERELEASES",
              "EVENTS",
            ],
            limit,
            offset,
            flatten: false,
            expandedFolders: [],
            folderUri: null,
            includeFoldersWhenFlattening: true,
          },
          operationName: "libraryV3",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "2de10199b2441d6e4ae875f27d2db361020c399fb10b03951120223fbed10b08",
            },
          },
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);

    const artistData = res.data.me.libraryV3;
    const pagingInfo = artistData.pagingInfo;

    const ids = artistData.items
      .filter(
        (item: any) =>
          item.item.__typename === "ArtistResponseWrapper" &&
          item.item.data.__typename === "Artist"
      )
      .map((item: any) => item.item._uri.split(":").pop());

    if (ids.length === 0) {
      return {
        offset: pagingInfo.offset,
        limit: pagingInfo.limit,
        total: artistData.totalCount,
        items: [],
      };
    }

    const artistsRes = await this.apiClient
      .get("artists", {
        searchParams: { ids: ids.join(",") },
      })
      .json<any>();

    SpotifyError.mayThrow(artistsRes);

    return {
      offset: pagingInfo.offset,
      limit: pagingInfo.limit,
      total: artistData.totalCount,
      items: artistsRes.artists,
    };
  }

  async isTracksSaved(ids: string[]): Promise<boolean[]> {
    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            uris: ids.map((id) => `spotify:track:${id}`),
          },
          operationName: "isCurated",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "e4ed1f91a2cc5415befedb85acf8671dc1a4bf3ca1a5b945a6386101a22e28a6",
            },
          },
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);

    const lookup = res.data.lookup;

    return lookup
      .filter((item: any) => item.data?.__typename === "Track")
      .map((item: any) => item.data?.isCurated ?? false);
  }

  async isInLibrary(
    ids: string[],
    { itemType }: { itemType: "artist" | "album" }
  ): Promise<boolean[]> {
    if (itemType !== "artist" && itemType !== "album") {
      throw new Error("itemType must be 'artist' or 'album'");
    }

    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            uris: ids.map((id) => `spotify:${itemType}:${id}`),
          },
          operationName: "areEntitiesInLibrary",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "134337999233cc6fdd6b1e6dbf94841409f04a946c5c7b744b09ba0dfe5a85ed",
            },
          },
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);

    const lookup = res.data.lookup;

    return lookup
      .filter((item: any) => item.data?.__typename.toLowerCase() === itemType)
      .map((item: any) => item.data?.saved ?? false);
  }

  async isPlaylistSaved(playlistId: string): Promise<boolean> {
    const res = await this.apiClient
      .get(`playlists/${playlistId}/followers/contains`)
      .json<any>();

    SpotifyError.mayThrow(res);
    return res[0] ?? false;
  }
}

export { SpotifyUserEndpoint };
