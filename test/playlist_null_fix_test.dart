// Regression tests for the playlist track-shape fix
// (lib/assets/hetu/playlist.ht, fetchPlaylist/tracks parsing).
//
// Surfaces covered:
// 1. empty/unavailable playlists omit `content` or `content.items`
//    -> zero tracks instead of a null-dereference throw;
// 2. entries with null `itemV2.data` (local/filtered) or a null entry itself
//    -> skipped instead of crashing on the first subscript;
// 3. episodes resolve `itemV2.data` to a *non-null* Episode object, so a null
//    check is not enough: the filter discriminates on the `spotify:track`
//    uri prefix, and the map body degrades (skip) on a missing album uri or
//    empty artists instead of throwing. A single episode used to reject the
//    whole tracks() future, returning nothing for the playlist.
// 4. inside the artists map, a null entry or one missing uri/profile threw
//    the same page-wide failure (that map runs before the track-level
//    guards) — bad artists are dropped, and a track left with none is skipped.
//
// The real playlist.ht runs in Hetu with the real hetu_std bytecode
// module; only the GQL HttpClient is stubbed. Run from the package root
// with `flutter test` — `dart test` cannot compile this package's Flutter
// dependencies.

import 'dart:convert';
import 'dart:io';

import 'package:hetu_script/hetu_script.dart';
import 'package:hetu_std/hetu_std.dart';
import 'package:test/test.dart';

// Resolved against the package root (the test runner's cwd) at runtime —
// never a machine-specific absolute path. Absolute form matters: the
// driver's bare `import ... from "playlist.ht"` resolves relative to the
// importing file, so a relative base breaks module resolution.
String get _hetuDir => Directory('lib/assets/hetu').absolute.path;

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
// [durationKey]/[durationValue] pick which spelling of the track length the
// payload carries: overview operations select `duration`, others select
// `trackDuration`, the REST shape uses a flat `duration_ms`.
Map<String, dynamic> _trackEntry(
  String n, {
  String durationKey = 'duration',
  Object durationValue = const {'totalMilliseconds': 180000},
}) =>
    {
      'itemV2': {
        'data': {
          'uri': 'spotify:track:track$n',
          'name': 'Track $n',
          durationKey: durationValue,
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

// Episode-shaped entry: itemV2.data is NON-NULL (an Episode object carries
// no artists/albumOfTrack). This is the shape that sailed through the old
// `data != null` filter and crashed the map body at albumOfTrack.
Map<String, dynamic> _episodeEntry(String n) => {
      'itemV2': {
        'data': {
          'uri': 'spotify:episode:ep$n',
          'name': 'Episode $n',
          'duration': {'totalMilliseconds': 3600000},
        },
      },
    };

// A well-formed track whose artists.items list is replaced verbatim by
// [artists], so entries can be null or missing uri/profile — the shapes that
// made the artists map throw before it was guarded.
Map<String, dynamic> _trackWithArtists(
  String n,
  List<Object?> artists,
) {
  final entry = _trackEntry(n);
  ((entry['itemV2'] as Map)['data'] as Map)['artists'] = {
    'items': artists
  };
  return entry;
}

Map<String, dynamic> _validArtist(String n) => {
      'uri': 'spotify:artist:va$n',
      'profile': {'name': 'Valid Artist $n'},
    };

// Runs the real playlist.ht `tracks()` over a raw items list (entries may be
// track maps, episode maps, null-data maps or nulls) and returns the
// converted items. Must not throw for any mixture.
Future<List> _trackItems(List<Object?> rawItems, String driver) async {
  final hetu = await _newInterpreter();
  final result = await _runDriver(
    hetu,
    driver,
    '''
${_stub('''{ playlistV2: {
  ownerV2: { data: {} },
  content: {
    totalCount: ${rawItems.length},
    items: [${rawItems.map(jsonEncode).join(', ')}]
  }
} }''')}
fun run() {
  return ep.tracks('pl1').then((data) {
    return data
  })
}
''',
  );
  final out =
      result is Map ? result : (result as dynamic).toJson() as Map;
  return out['items'] as List;
}

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

// Runs the real playlist.ht `tracks()` over a single-item payload and returns
// the converted track map.
Future<Map> _firstTrackItem(Object itemV2) async {
  final hetu = await _newInterpreter();
  final result = await _runDriver(
    hetu,
    'duration',
    '''
${_stub('''{ playlistV2: {
  ownerV2: { data: {} },
  content: { totalCount: 1, items: [ { itemV2: ${jsonEncode(itemV2)} } ] }
} }''')}
fun run() {
  return ep.tracks('pl1').then((data) {
    return data
  })
}
''',
  );
  final out =
      result is Map ? result : (result as dynamic).toJson() as Map;
  final items = out['items'] as List;
  expect(items, hasLength(1));
  return items.first as Map;
}

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

  test('episode-shaped entries are skipped without throwing', () async {
    // An episode resolves itemV2.data to a non-null Episode object (no
    // artists/albumOfTrack). The old `data != null` filter let it through
    // and the map body threw at albumOfTrack, rejecting the whole page.
    final items = await _trackItems(
      [_trackEntry('1'), _episodeEntry('9'), _trackEntry('2')],
      'episodes',
    );
    expect(items, hasLength(2),
        reason: 'episodes must be skipped, not crash the page');
    expect((items[0] as Map)['name'], 'Track 1');
    expect((items[1] as Map)['name'], 'Track 2');
  });

  test('null entries are skipped without throwing', () async {
    final items = await _trackItems(
      [null, _trackEntry('1'), null],
      'nullentries',
    );
    expect(items, hasLength(1));
    expect((items[0] as Map)['name'], 'Track 1');
  });

  test('malformed track without album is skipped without throwing',
      () async {
    final entry = _trackEntry('5');
    (entry['itemV2']!['data'] as Map).remove('albumOfTrack');
    final items = await _trackItems(
      [entry, _trackEntry('6')],
      'noalbum',
    );
    expect(items, hasLength(1));
    expect((items[0] as Map)['name'], 'Track 6');
  });

  test('malformed artist entries are dropped, track survives', () async {
    // The artists map ran before the track-level guards, so a null artist or
    // one without uri/profile threw exactly like the episode case did.
    final items = await _trackItems(
      [
        _trackWithArtists('11', [
          null,
          _validArtist('a'),
          {'uri': 'spotify:artist:noprofile'},
          {'profile': {'name': 'No uri'}},
          _validArtist('b'),
        ]),
        _trackEntry('12'),
      ],
      'badartists',
    );
    expect(items, hasLength(2),
        reason: 'bad artists must not cost the page a valid track');
    final artists = (items[0] as Map)['artists'] as List;
    expect(artists, hasLength(2));
    expect((artists[0] as Map)['name'], 'Valid Artist a');
    expect((artists[1] as Map)['name'], 'Valid Artist b');
    // The album block carries the first surviving artist.
    final albumArtists =
        (((items[0] as Map)['album'] as Map)['artists'] as List);
    expect(albumArtists, hasLength(1));
    expect((albumArtists[0] as Map)['name'], 'Valid Artist a');
  });

  test('a track with no usable artists is skipped, not rendered headless',
      () async {
    final items = await _trackItems(
      [
        _trackWithArtists('13', [null, {'profile': {'name': 'No uri'}}]),
        _trackEntry('14'),
      ],
      'noartistsleft',
    );
    expect(items, hasLength(1));
    expect((items[0] as Map)['name'], 'Track 14');
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
    expect(track['duration_ms'], 180000);
    expect((track['album'] as Map)['name'], 'Album 7');
    expect(((track['artists'] as List)[0] as Map)['name'], 'Artist 7');
  });

  group('track length spelling', () {
    // Every spelling the payload can carry must land in `duration_ms`; a miss
    // is silent downstream because the plugin converter does `?? 0`, which is
    // what renders as 0:00 in the host.
    for (final (key, value) in [
      ('duration', {'totalMilliseconds': 180000}),
      ('trackDuration', {'totalMilliseconds': 180000}),
      ('duration_ms', 180000),
    ]) {
      test('$key is read', () async {
        final item = await _firstTrackItem(
            _trackEntry('3', durationKey: key, durationValue: value)['itemV2']!);
        expect(item['duration_ms'], 180000);
      });
    }

    test('absent yields null, which the converter turns into 0:00', () async {
      final entry = _trackEntry('3');
      (entry['itemV2']!['data'] as Map).remove('duration');
      final item = await _firstTrackItem(entry['itemV2']!);
      expect(item['duration_ms'], isNull,
          reason: 'no spelling present -> null, defaulted by the converter');
    });
  });
}
