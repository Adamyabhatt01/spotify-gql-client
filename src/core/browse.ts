import { HttpClient } from "./http-client.js"
import { SpotifyError } from "./error.js";
import type {
  BrowseSectionItem,
  GqlAlbumSimplified,
  GqlArtist,
  GqlArtistSimplified,
  GqlPage,
  GqlPlaylistSimplified,
  GqlUser,
} from "../types/gql-api.js";

class SpotifyBrowseEndpoint {
  apiClient!: HttpClient;
  gqlClient!: HttpClient;

  constructor(apiClient: HttpClient, gqlClient: HttpClient) {
    this.apiClient = apiClient;
    this.gqlClient = gqlClient;
  }

  parseSectionItems(section: Record<string, any>): BrowseSectionItem {
    const id = section.uri.split(":").pop();

    return {
      id,
      uri: section.uri,
      title: section.data.title.transformedLabel,
      external_urls: {
        spotify: `https://open.spotify.com/section/${id}`,
      },
      items: section.sectionItems.items
        .map((item: any) => {
          const wrapperTypeName = item.content.__typename;
          const contentTypeName = item.content.data?.__typename;

          if (
            wrapperTypeName === "PlaylistResponseWrapper" &&
            contentTypeName === "Playlist"
          ) {
            const id = item.uri.split(":").pop();
            const playlist = item.content.data;
            const ownerV2 = playlist.ownerV2.data;
            const ownerId = ownerV2.uri.split(":")?.pop();

            return {
              objectType: "Playlist",
              id,
              description: playlist.description,
              external_urls: {
                spotify: `https://open.spotify.com/playlist/${id}`,
              },
              images:
                playlist.images?.items.flatMap((image: any) => image.sources) ??
                [],
              name: playlist.name,
              owner: {
                type: "User",
                external_urls: {
                  spotify: `https://open.spotify.com/user/${ownerId}`,
                },
                id: ownerId,
                uri: ownerV2.uri,
                display_name: ownerV2.name,
                images: ownerV2.avatar?.sources ?? [],
              } satisfies GqlUser,
              uri: item.uri,
            } satisfies GqlPlaylistSimplified;
          } else if (
            wrapperTypeName === "AlbumResponseWrapper" &&
            contentTypeName === "Album"
          ) {
            const id = item.uri.split(":").pop();
            const album = item.content.data;

            return {
              objectType: "Album",
              id,
              name: album.name,
              album_type: album.albumType?.toLowerCase(),
              external_urls: {
                spotify: `https://open.spotify.com/album/${id}`,
              },
              uri: item.uri,
              images: album.coverArt?.sources ?? [],
              artists: (album.artists?.items?.map((artist: any) => {
                const id = artist.uri.split(":").pop();
                return {
                  id,
                  uri: artist.uri,
                  name: artist.profile.name,
                  external_urls: {
                    spotify: `https://open.spotify.com/artist/${id}`,
                  },
                  objectType: "Artist",
                } satisfies GqlArtistSimplified;
              }) ?? []) as GqlArtistSimplified[],
            } satisfies GqlAlbumSimplified;
          } else if (
            wrapperTypeName === "ArtistResponseWrapper" &&
            contentTypeName === "Artist"
          ) {
            const id = item.uri.split(":").pop();
            const artist = item.content.data;

            return {
              objectType: "Artist",
              id,
              name: artist.profile.name,
              uri: item.uri,
              external_urls: {
                spotify: `https://open.spotify.com/artist/${id}`,
              },
              images: artist.visuals.avatarImage?.sources ?? [],
            } satisfies GqlArtist;
          }

          return null;
        })
        .filter((item: any) => item !== null),
    } satisfies BrowseSectionItem;
  }

  async home({
    timeZone,
    spTCookie,
    limit = 20,
  }: {
    timeZone: string;
    spTCookie: string;
    limit?: number;
  }): Promise<BrowseSectionItem[]> {
    const res = await this.gqlClient
      .post("query", {
        body: {
          variables: {
            timeZone,
            sp_t: spTCookie,
            facet: "",
            sectionItemsLimit: limit,
          },
          operationName: "home",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "d62af2714f2623c923cc9eeca4b9545b4363abaa9188a9e94e2b63b823419a2c",
            },
          },
        },
      })
      ;

    SpotifyError.mayThrow(res);

    const homeData = res.data.home;
    const homeSections = homeData.sectionContainer.sections.items;

    return homeSections
      .filter(
        (section: any) =>
          section.data.__typename === "HomeGenericSectionData" &&
          section.sectionItems != null &&
          section.sectionItems.items?.length > 0
      )
      .map((section: any) => {
        return this.parseSectionItems(section);
      })
      .filter(
        (section: any) => section.items.length > 0
      ) satisfies BrowseSectionItem[];
  }

  async homeSection(
    id: string,
    {
      timeZone,
      spTCookie,
      limit = 20,
      offset = 0,
    }: {
      timeZone: string;
      spTCookie: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<GqlPage<BrowseSectionItem["items"][number]>> {
    const res = await this.gqlClient
      .post("query", {
        body: {
          variables: {
            uri: `spotify:section:${id}`,
            timeZone,
            sp_t: spTCookie,
            facet: "",
            sectionItemsOffset: offset,
            sectionItemsLimit: limit,
          },
          operationName: "homeSection",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash:
                "d62af2714f2623c923cc9eeca4b9545b4363abaa9188a9e94e2b63b823419a2c",
            },
          },
        },
      })
      ;

    SpotifyError.mayThrow(res);

    const homeSection = res.data.homeSections.sections[0].sectionItems;
    const pagingInfo = homeSection.pagingInfo;

    const items = this.parseSectionItems(
      res.data.homeSections.sections[0]
    ).items;

    return {
      offset: pagingInfo.offset ?? offset,
      limit: pagingInfo.limit ?? limit,
      total: homeSection.totalCount ?? 0,
      items,
    };
  }
}

export { SpotifyBrowseEndpoint };
