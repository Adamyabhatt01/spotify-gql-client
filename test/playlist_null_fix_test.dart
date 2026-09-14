// Regression tests for the playlist null-surface fix
// (lib/assets/hetu/playlist.ht, fetchPlaylist/tracks parsing).
//
// Two surfaces fixed:
// 1. empty/unavailable playlists omit `content` or `content.items`
//    -> zero tracks instead of a null-dereference throw;
// 2. `itemV2.data` is null for non-track entries (episodes, filtered)
//    -> skipped instead of crashing on artists/albumOfTrack.
//
// The real playlist.ht runs in Hetu with the real hetu_std bytecode
// module; only the GQL HttpClient is stubbed. Run with `flutter test`.

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
  for (final name in ['playlist.ht', 'error.ht']) {
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
    HTSource('import { SpotifyPlaylistEndpoint } from "playlist.ht"\n$body',
        fullName: path),
  );
  return hetu.evalFile(path, invokeFunc: 'run');
}

// Real GQL item shape (playlistV2): track entry with itemV2.data present.
Map<String, dynamic> _trackEntry(String n) => {
      'itemV2': {
        'data': {
          'uri': 'spotify:track:track$n',
          'name': 'Track $n',
          'duration': {'totalMilliseconds': 180000},
          'artists': {
            'items': [
              {
                'uri': 'spotify:artist:a$n',
                'profile': {'name': 'Artist $n'},
              }
            ]
          },
          'albumOfTrack': {
            'uri': 'spotify:album:alb$n',
            'name': 'Album $n',
            'coverArt': {
              'sources': [
                {'url': 'https://example.test/c$n.jpg'}
              ]
            },
          },
        },
      },
    };

String _stub(String bodyHetu) => '''
var calls = []
var stubGql = {
  post: (url, {data}) {
    calls.add(data)
    return Future.value({ data: { data: $bodyHetu } })
  }
}
var ep = SpotifyPlaylistEndpoint(null, stubGql)
''';

void main() {
  test('null content yields zero tracks instead of throwing', () async {
    final hetu = await _newInterpreter();
    final result = await _runDriver(
      hetu,
      'nullcontent',
      '''
${_stub('{ playlistV2: { ownerV2: { data: { name: "X" } } } }')}
fun run() {
  return ep.tracks('pl1').then((data) {
    return data
  })
}
''',
    );
    // Driver result crosses the bridge as a Dart Map (items contain
    // toJson'd Maps) or an HTStruct — normalize both.
    final out = result is Map
        ? result
        : (result as dynamic).toJson() as Map;
    expect(out['items'], isEmpty);
    expect(out['total'], 0);
    // Pre-existing next computation: 0 < limit(50) -> URL (not null).
    expect(out['next'],
        'https://api.spotify.com/v1/playlists/pl1/tracks?offset=0&limit=50');
  });

  test('missing items key yields zero tracks', () async {
    final hetu = await _newInterpreter();
    final result = await _runDriver(
      hetu,
      'noitems',
      '''
${_stub('{ playlistV2: { ownerV2: { data: {} }, content: { totalCount: 0 } } }')}
fun run() {
  return ep.tracks('pl1').then((data) {
    return data
  })
}
''',
    );
    // Driver result crosses the bridge as a Dart Map (items contain
    // toJson'd Maps) or an HTStruct — normalize both.
    final out = result is Map
        ? result
        : (result as dynamic).toJson() as Map;
    expect(out['items'], isEmpty);
    expect(out['total'], 0);
  });

  test('null itemV2.data entries are skipped, valid entries converted',
      () async {
    final hetu = await _newInterpreter();
    final result = await _runDriver(
      hetu,
      'skipnull',
      '''
${_stub('''{ playlistV2: {
  ownerV2: { data: {} },
  content: {
    totalCount: 3,
    items: [
      { itemV2: { data: null } },
      { itemV2: ${jsonEncode(_trackEntry('1')['itemV2'])} },
      { itemV2: { data: null } },
      { itemV2: ${jsonEncode(_trackEntry('2')['itemV2'])} }
    ]
  }
} }''')}
fun run() {
  return ep.tracks('pl1').then((data) {
    return data
  })
}
''',
    );
    // Driver result crosses the bridge as a Dart Map (items contain
    // toJson'd Maps) or an HTStruct — normalize both.
    final out = result is Map
        ? result
        : (result as dynamic).toJson() as Map;
    final items = out['items'] as List;
    expect(items, hasLength(2),
        reason: 'null itemV2.data entries must be skipped, not crash');
    expect((items[0] as Map)['name'], 'Track 1');
    expect((items[1] as Map)['name'], 'Track 2');
    expect(out['total'], 3);
  });

  test('all-valid playlist converts unchanged', () async {
    final hetu = await _newInterpreter();
    final result = await _runDriver(
      hetu,
      'valid',
      '''
${_stub('''{ playlistV2: {
  ownerV2: { data: {} },
  content: {
    totalCount: 1,
    items: [ { itemV2: ${jsonEncode(_trackEntry('7')['itemV2'])} } ]
  }
} }''')}
fun run() {
  return ep.tracks('pl1').then((data) {
    return data
  })
}
''',
    );
    // Driver result crosses the bridge as a Dart Map (items contain
    // toJson'd Maps) or an HTStruct — normalize both.
    final out = result is Map
        ? result
        : (result as dynamic).toJson() as Map;
    final items = out['items'] as List;
    expect(items, hasLength(1));
    final track = items[0] as Map;
    expect(track['name'], 'Track 7');
    expect(track['uri'], 'spotify:track:track7');
    expect((track['album'] as Map)['name'], 'Album 7');
    expect(((track['artists'] as List)[0] as Map)['name'], 'Artist 7');
  });
}
