import type { KyInstance } from "ky";
import { SpotifyError } from "./error.js";
import type { Album, Page, SimplifiedAlbum, Track } from "../types/web-api.js";
import type { GqlAlbum, GqlAlbumSimplified, GqlPage } from "../types/gql-api.js";

class SpotifyAlbumEndpoint {
  apiClient!: KyInstance;
  gqlClient!: KyInstance;

  constructor(apiClient: KyInstance, gqlClient: KyInstance) {
    this.apiClient = apiClient;
    this.gqlClient = gqlClient;
  }

  async getAlbum(albumId: string): Promise<Album> {
    const res = await this.apiClient.get(`albums/${albumId}`).json<any>();
    SpotifyError.mayThrow(res);
    return res;
  }

  async tracks(
    albumId: string,
    { offset = 0, limit = 20 }: { offset?: number; limit?: number } = {}
  ): Promise<Page<Track>> {
    const res = await this.apiClient
      .get(`albums/${albumId}/tracks`, {
        searchParams: {
          offset,
          limit,
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);
    const ids = res.items.map((item: any) => item.id);

    const tracksRes = await this.apiClient
      .get("tracks", {
        searchParams: { ids: ids.join(",") },
      })
      .json<any>();

    SpotifyError.mayThrow(tracksRes);
    res.items = tracksRes.tracks;

    return res;
  }

  async releases({
    offset = 0,
    limit = 20,
  }: { offset?: number; limit?: number } = {}): Promise<
    GqlPage<GqlAlbum>
  > {
    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            offset,
            limit,
            onlyUnPlayedItems: false,
            includedContentTypes: ["ALBUM"],
          },
          operationName: "queryWhatsNewFeed",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "3b53dede3c6054e8b7c962dd280eb6761c5d1c82b06b039f4110d76a62b4966b",
            },
          },
        },
      })
      .json<any>();

    SpotifyError.mayThrow(res);

    const releasesData = res.data.whatsNewFeedItems;
    const pagingInfo = releasesData.pagingInfo;
    const items = releasesData.items
      .filter(
        (item: any) =>
          item.content?.__typename === "AlbumResponseWrapper" &&
          item.content?.data?.__typename === "Album"
      )
      .map((item: any) => {
        const album = item.content.data;
        const id = album.uri.split(":").pop();

        return {
          id,
          name: album.name,
          album_type: album.albumType?.toLowerCase(),
          release_date: album.date?.isoString,
          release_date_precision: album.date?.precision ?? "day",
          images: album.coverArt?.sources,
          external_urls: {
            spotify: `https://open.spotify.com/album/${id}`,
          },
          artists:
            album.artists?.items?.map((artist: any) => {
              const artistId = artist.uri.split(":").pop();
              return {
                id: artistId,
                uri: artist.uri,
                name: artist.profile.name,
                external_urls: {
                  spotify: `https://open.spotify.com/artist/${artistId}`,
                },
              };
            }) ?? [],
        };
      });

    return {
      offset: pagingInfo.offset,
      limit: pagingInfo.limit,
      total: releasesData.totalCount,
      items,
    };
  }

  async save(albumIds: string[]) {
    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            uris: albumIds.map((id) => `spotify:album:${id}`),
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

  async unsave(albumIds: string[]) {
    const res = await this.gqlClient
      .post("", {
        json: {
          variables: {
            uris: albumIds.map((id) => `spotify:album:${id}`),
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
}

export { SpotifyAlbumEndpoint };
