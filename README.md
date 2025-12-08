# Spotify GQL Client (Unofficial)

Lightweight experimental JS/TS client for Spotify’s internal Pathfinder (GraphQL) and Web APIs. This project is not affiliated with, endorsed by, or produced by Spotify. And, by law, patent and copy right, illegal to use for commercial purposes. Use for experimentation/personal-usage only.

## Features
- Simple wrapper around Spotify’s Web API (`/v1`) and Pathfinder GraphQL endpoints.
- Works in Node (ESM) with TypeScript typings.
- Includes an example script that saves sample responses to JSON.

## Installation
```sh
pnpm add spotify-gql-client
# or
npm install spotify-gql-client
# or
yarn add spotify-gql-client
```

Requirements: Node 18+ and ESM (this package is "type": "module").

## Environment
- SPOTIFY_ACCESS_TOKEN (required): a valid Web API token.
- SPOTIFY_SP_T_COOKIE (required for browse endpoints): your sp_t cookie value.
- Optional: TZ for time zone handling.


## Quick Start (TypeScript)

```typescript
import { SpotifyGqlApi } from "spotify-gql-client";

async function main() {
  const client = new SpotifyGqlApi(process.env.SPOTIFY_ACCESS_TOKEN!);

  const album = await client.album.getAlbum("4aawyAB9vmqN3uQ7FjRGTy");
  console.log(album);

  const tracks = await client.search.tracks("Imagine Dragons", { limit: 5 });
  console.log(tracks);
}

main().catch(console.error);
```

## Browse Example (requires `SPOTIFY_SP_T_COOKIE`)

```typescript
const data = await client.browse.home({
  spTCookie: process.env.SPOTIFY_SP_T_COOKIE!,
  timeZone: "America/New_York",
  limit: 10,
});
console.log(data);
```

## Run the bundled example

```shell
$ pnpm install
$ pnpm example
```

The example sequentially calls multiple endpoints, waits 1s between calls, and saves each response to example/*.json.

## License
[MIT License](/LICENSE)

## Disclaimer
This project is not affiliated with, endorsed by, or produced by Spotify.
Provided for experimentation/education only; use at your own risk.