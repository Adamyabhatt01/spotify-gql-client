// Artist-page album names.
//
// queryArtistOverview's albumOfTrack selection carries uri + coverArt but no
// title, so top tracks used to render the literal "unknown" in the album
// column. The fix takes the titles that the same response's discography
// selection already holds, and asks the Web API batch endpoint
// (GET /albums?ids=…) only for whatever is left over.
//
// Same harness as artist_overview_cache_test.dart: the real artist.ht runs in
// Hetu with the real hetu_std bindings; both HttpClients are stubbed so call
// counts, query parameters and response statuses are observable. Run with
// `flutter test` (hetu_std needs dart:ui).

import 'dart:convert';
import 'dart:io';

import 'package:hetu_script/hetu_script.dart';
import 'package:hetu_std/hetu_std.dart';
import 'package:test/test.dart';

const _hetuDir =
    '/home/adamya/projects/hetu_spotify_gql_client/lib/assets/hetu';

Future<Hetu> _newInterpreter() async {
  final hetu = Hetu();
  hetu.init();
  HetuStdLoader.loadBindings(hetu);
  final config = jsonDecode(
      await File('.dart_tool/package_config.json').readAsString());
  final stdRoot = (config['packages'] as List)
      .cast<Map>()
      .firstWhere((p) => p['name'] == 'hetu_std')['rootUri'];
  await HetuStdLoader.loadBytecodePureDart(
      hetu, Uri.parse(stdRoot).toFilePath());
  for (final name in ['artist.ht', 'error.ht']) {
    final path = '$_hetuDir/$name';
    hetu.sourceContext.addResource(
      path,
      HTSource(await File(path).readAsString(), fullName: path),
    );
  }
  return hetu;
}

Future<dynamic> _runDriver(Hetu hetu, String name, String body) async {
  final path = '$_hetuDir/_driver_$name.ht';
  hetu.sourceContext.addResource(
    path,
    HTSource(
        'import { SpotifyArtistEndpoint } from "artist.ht"\n$body',
        fullName: path),
  );
  return hetu.evalFile(path, invokeFunc: 'run');
}

/// Two top tracks on two distinct albums (one album when [shared]), shaped the
/// way queryArtistOverview actually returns it: uri and coverArt, no name.
///
/// [discography] controls what the discography selection lists, which is where
/// the album title actually is in that response: `'partial'` names only
/// album1, `'full'` names both, null names neither.
String _overviewPayload({
  required bool withAlbumNames,
  bool shared = false,
  String? discography,
}) {
  final name = withAlbumNames ? "name: 'Album 1', " : '';
  final name2 = withAlbumNames ? "name: 'Album 2', " : '';
  final secondAlbumUri = shared ? 'album1' : 'album2';
  final releases = [
    if (discography != null)
      "{ releases: { items: [ { uri: 'spotify:album:album1', name: 'Discography One' } ] } }",
    if (discography == 'full')
      "{ releases: { items: [ { uri: 'spotify:album:album2', name: 'Discography Two' } ] } }",
  ].join(', ');
  return '''
{
  data: {
    artistUnion: {
      stats: { followers: 12345 },
      visuals: { avatarImage: { sources: [{ url: 'https://example.test/avatar.jpg' }] } },
      profile: { name: 'Artist ARTIST' },
      discography: {
        topTracks: { items: [
          { track: {
            uri: 'spotify:track:track1', name: 'Track 1',
            duration: { totalMilliseconds: 180000 },
            artists: { items: [{ uri: 'spotify:artist:abc', profile: { name: 'Artist ARTIST' } }] },
            albumOfTrack: { uri: 'spotify:album:album1', ${name}
              coverArt: { sources: [{ url: 'https://example.test/cover1.jpg' }] } }
          } },
          { track: {
            uri: 'spotify:track:track2', name: 'Track 2',
            duration: { totalMilliseconds: 200000 },
            artists: { items: [{ uri: 'spotify:artist:abc', profile: { name: 'Artist ARTIST' } }] },
            albumOfTrack: { uri: 'spotify:album:${secondAlbumUri}', ${name2}
              coverArt: { sources: [{ url: 'https://example.test/cover2.jpg' }] } }
          } }
        ] },
        albums: { totalCount: ${releases.isEmpty ? 0 : 1}, items: [$releases] },
        singles: { totalCount: 0, items: [] },
        compilations: { totalCount: 0, items: [] }
      }
    }
  }
}
''';
}

/// [mode] picks what the batch endpoint answers; [withAlbumNames] picks the
/// overview shape. Both are interpolated into the Hetu source.
///
/// The batch bodies go through `JSON.decode` rather than a hetu literal
/// because that is what Dio hands back: a native Map. Hetu's own struct
/// literals are not `is Map` (see error.ht's guard, which relies on the same
/// distinction), so a literal would test the merge against a shape the
/// runtime never produces.
String _stubPrelude({
  required String mode,
  required bool withAlbumNames,
  bool shared = false,
  String? discography,
}) {
  final batchResponse = switch (mode) {
    'missing' =>
      "JSON.decode('{\"albums\": [{\"id\": \"album1\", \"name\": \"Real One\"}, null]}')",
    'ratelimited' =>
      "JSON.decode('{\"error\": {\"status\": 429, \"message\": \"Too Many Requests\"}}')",
    'notjson' => "'surprise'",
    _ =>
      "JSON.decode('{\"albums\": [{\"id\": \"album1\", \"name\": \"Real One\"}, {\"id\": \"album2\", \"name\": \"Real Two\"}]}')",
  };
  final statusCode = mode == 'ratelimited' ? 429 : 200;
  return '''
import "module:std" as std
var JSON = std.JSON
var overviewCalls = []
var albumCalls = []
var stubGql = {
  post: (url, {data}) {
    overviewCalls.add(data)
    return Future.value({ data: ${_overviewPayload(withAlbumNames: withAlbumNames, shared: shared, discography: discography)} })
  }
}
var stubRest = {
  get_req: (path, {queryParameters, options}) {
    albumCalls.add({
      path: path,
      ids: queryParameters["ids"],
      // Script cannot read back RequestOptions.validateStatus (the field is a
      // raw Dart function the HT binding does not wrap), so what is observable
      // here is that per-request options were passed at all.
      lenient: options != null
    }.toJson())
    return Future.value({ statusCode: $statusCode, data: $batchResponse })
  }
}
var ep = SpotifyArtistEndpoint(stubRest, stubGql)
''';
}

/// [times] topTracks calls on one endpoint instance, so the second one runs
/// against the overview cache and whatever names the first one learned.
String _runTopTracks(int times) {
  final first = '''
  return ep.topTracks("abc").then((r) {
''';
  final chain = times > 1
      ? '''
    return ep.topTracks("abc")
  }).then((r) {
'''
      : '';
  return '''
fun run() {
$first$chain    return { tracks: r["tracks"], albumCalls: albumCalls, overviewCalls: overviewCalls.length }
  })
}
''';
}

Future<Map<String, dynamic>> _topTracks(
  String mode, {
  bool withAlbumNames = false,
  bool shared = false,
  String? discography,
  int times = 1,
}) async {
  final hetu = await _newInterpreter();
  final result = await _runDriver(
    hetu,
    'albums_$mode${withAlbumNames}_named${shared}_$times$discography',
    '''
${_stubPrelude(mode: mode, withAlbumNames: withAlbumNames, shared: shared, discography: discography)}
${_runTopTracks(times)}
''',
  );
  final tracks = (result['tracks'] as List).cast<Map>();
  return {
    'albums': tracks.map((t) => (t['album'] as Map)['name']).toList(),
    'albumCalls': (result['albumCalls'] as List).cast<Map>(),
    'overviewCalls': result['overviewCalls'],
  };
}

void main() {
  test('unnamed albums are filled by one batch call, ids deduped', () async {
    final r = await _topTracks('ok');

    expect(r['albums'], ['Real One', 'Real Two']);
    expect(r['albumCalls'], hasLength(1),
        reason: 'one request must cover the whole page');
    expect((r['albumCalls']!.first as Map)['path'], '/albums');
    expect((r['albumCalls']!.first as Map)['ids'], 'album1,album2');
    expect((r['albumCalls']!.first as Map)['lenient'], true,
        reason: 'the batch must resolve on any status; script cannot catch '
            'a rejected future');
  });

  test('two tracks on one album ask for that album once', () async {
    final r = await _topTracks('ok', shared: true);

    expect(r['albums'], ['Real One', 'Real One']);
    expect((r['albumCalls']!.first as Map)['ids'], 'album1',
        reason: 'ids are deduped before the request is built');
  });

  test('an album missing from the batch keeps the row, no throw', () async {
    final r = await _topTracks('missing');

    expect(r['albums'], ['Real One', ''],
        reason: 'the placeholder is now an empty cell, never "unknown"');
  });

  test('a rate-limited batch degrades the column, not the section', () async {
    final r = await _topTracks('ratelimited');

    expect(r['albums'], ['', '']);
    expect(r['albumCalls'], hasLength(1));
  });

  test('a non-object batch body degrades instead of throwing', () async {
    final r = await _topTracks('notjson');

    expect(r['albums'], ['', '']);
  });

  test('already-named albums issue no batch request at all', () async {
    final r = await _topTracks('ok', withAlbumNames: true);

    expect(r['albums'], ['Album 1', 'Album 2']);
    expect(r['albumCalls'], isEmpty,
        reason: 'the request is conditional, not a fixed cost per artist page');
  });

  test('titles already in the discography selection are not re-requested',
      () async {
    final r = await _topTracks('ok', discography: 'partial');

    expect(r['albums'], ['Discography One', 'Real Two'],
        reason: 'album1 came free from the overview, album2 from the batch');
    expect((r['albumCalls']!.first as Map)['ids'], 'album2',
        reason: 'the batch is asked only for what the response could not name');
  });

  test('a fully named discography issues no batch request', () async {
    final r = await _topTracks('ok', discography: 'full');

    expect(r['albums'], ['Discography One', 'Discography Two']);
    expect(r['albumCalls'], isEmpty,
        reason: 'the Spotify profile page shows these same titles, so the '
            'overview usually covers the whole list');
  });

  test('a batch that gets nothing through stops being re-requested', () async {
    final r = await _topTracks('ratelimited', times: 2);

    expect(r['albumCalls'], hasLength(1),
        reason: 'the REST quota is the one Spotify 429s, and the host gate '
            'cannot see a request made inside the plugin VM, so the plugin '
            'has to cooldown on its own');
    expect(r['albums'], ['', '']);
  });

  test('a second topTracks call reuses learned names and cached overview',
      () async {
    final r = await _topTracks('ok', times: 2);

    expect(r['albums'], ['Real One', 'Real Two']);
    expect(r['albumCalls'], hasLength(1),
        reason: 'names learned from a batch are remembered, not paid for twice');
    expect(r['overviewCalls'], 1, reason: 'the 10s overview cache still holds');
  });

  test('the overview is still requested exactly once', () async {
    final hetu = await _newInterpreter();
    await _runDriver(
      hetu,
      'albums_oneshot',
      '''
${_stubPrelude(mode: 'ok', withAlbumNames: false)}
fun run() {
  return ep.topTracks("abc").then((r) { return overviewCalls.length })
}
''',
    ).then((value) => expect(value, 1));
  });
}
