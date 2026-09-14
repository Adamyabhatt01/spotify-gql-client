// Regression tests for the artist-side queryArtistOverview coalescing
// (10-second TTL request-result cache in lib/assets/hetu/artist.ht).
//
// The real artist.ht runs in Hetu with the real hetu_std bytecode module;
// only the GQL HttpClient is stubbed (call counting + controllable
// completion). Each case is a virtual driver file evaluated in one shot;
// the driver returns a Future the Dart test awaits, so no polling,
// timers, or cross-eval reads are needed. Run with `flutter test`
// (hetu_std needs dart:ui).

import 'dart:async';
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
  // Dart-side external classes (HttpClient, DateTime, ...) backing std.
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

// Minimal but structurally complete queryArtistOverview payload covering
// every path the three parsers touch, as a hetu map literal.
const _payloadHetu = '''
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
            albumOfTrack: { uri: 'spotify:album:album1', name: 'Album 1',
              coverArt: { sources: [{ url: 'https://example.test/cover1.jpg' }] } }
          } },
          { track: {
            uri: 'spotify:track:track2', name: 'Track 2',
            duration: { totalMilliseconds: 200000 },
            artists: { items: [{ uri: 'spotify:artist:abc', profile: { name: 'Artist ARTIST' } }] },
            albumOfTrack: { uri: 'spotify:album:album1', name: 'Album 1',
              coverArt: { sources: [{ url: 'https://example.test/cover1.jpg' }] } }
          } }
        ] },
        albums: { totalCount: 1, items: [
          { releases: { items: [
            { uri: 'spotify:album:album1', type: 'ALBUM', name: 'Album 1',
              coverArt: { sources: [{ url: 'https://example.test/cover1.jpg' }] },
              label: 'Label 1',
              date: { year: 2024, month: 1, day: 2, precision: 'DAY' },
              tracks: { totalCount: 10 },
              copyright: { items: [{ text: '(c) Label', type: 'P' }] } }
          ] } }
        ] },
        singles: { totalCount: 0, items: [] },
        compilations: { totalCount: 0, items: [] }
      }
    }
  }
}
''';

String _stubPrelude(String mode) => '''
var calls = []
var stubGql = {
  post: (url, {data}) {
    calls.add(data)
    if ('$mode' == 'reject') {
      return Future(() { throw 'rej429'; })
    }
    return Future.value({ data: $_payloadHetu })
  }
}
var ep = SpotifyArtistEndpoint(null, stubGql)
''';

void main() {
  test('concurrent same-URI callers share one POST', () async {
    final hetu = await _newInterpreter();
    final result = await _runDriver(
      hetu,
      'share',
      '''
${_stubPrelude('ok')}
fun run() {
  var f1 = ep.getArtist("abc")
  var f2 = ep.topTracks("abc")
  var f3 = ep.albums("abc")
  var syncCalls = calls.length
  return Future.wait([f1, f2, f3]).then((rs) {
    return { syncCalls: syncCalls, r1: rs[0], r2: rs[1], r3: rs[2] }
  })
}
''',
    );
    expect(result['syncCalls'], 1,
        reason: 'three concurrent consumers must issue one POST');
    final r1 = result['r1'] as Map;
    final r2 = result['r2'] as Map;
    final r3 = result['r3'] as Map;
    expect(r1['id'], 'abc');
    expect(r1['name'], 'Artist ARTIST');
    expect((r2['tracks'] as List), hasLength(2));
    expect((r2['tracks'] as List)[0]['name'], 'Track 1');
    expect((r3['items'] as List), hasLength(1));
    expect((r3['items'] as List)[0]['name'], 'Album 1');
  });

  test('different URIs issue independent POSTs', () async {
    final hetu = await _newInterpreter();
    final result = await _runDriver(
      hetu,
      'isolate',
      '''
${_stubPrelude('ok')}
fun run() {
  var ra = ep.getArtist("aaa")
  return ra.then((_) {
    return ep.getArtist("bbb").then((_) {
      return calls.length
    })
  })
}
''',
    );
    expect(result, 2);
  });

  test('rejection is shared, TTL predicate bounds reuse', () async {
    final hetu = await _newInterpreter();
    // Hetu 0.4.2 cannot catch async errors in-script, so rejections surface
    // as zone errors; capture them instead of failing the run.
    final zoneErrors = <Object>[];
    final syncCalls = await runZonedGuarded(() async {
      return await _runDriver(
        hetu,
        'reject',
        '''
${_stubPrelude('reject')}
fun run() {
  var f1 = ep.getArtist("abc")
  var f2 = ep.topTracks("abc")
  return calls.length
}
''',
      );
    }, (e, s) => zoneErrors.add(e));
    await Future<void>.delayed(const Duration(milliseconds: 300));
    expect(syncCalls, 1,
        reason: 'concurrent sharers issue one POST even on failure');
    expect(zoneErrors, hasLength(2),
        reason: 'both sharers observe the shared rejection');
    // TTL-boundary predicate: fresh entries stay shared, expired refetch.
    // (Post-expiry refetch itself was proven with injected clocks; the real
    // 10s TTL is intentionally not waited out in unit tests.)
  });

  test('overviewFresh boundary semantics', () async {
    final hetu = await _newInterpreter();
    final result = await _runDriver(
      hetu,
      'fresh',
      '''
${_stubPrelude('ok')}
var ep2 = SpotifyArtistEndpoint(null, stubGql)
fun run() {
  return {
    before: ep2.overviewFresh(0, 9999),
    at: ep2.overviewFresh(0, 10000),
    after: ep2.overviewFresh(0, 10001)
  }
}
''',
    );
    expect(result['before'], isTrue);
    expect(result['at'], isFalse);
    expect(result['after'], isFalse);
  });
}
