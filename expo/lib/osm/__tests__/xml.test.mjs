import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    buildChangesetCreateXML,
    buildOsmChangeCreateXML,
    buildOsmChangeDeleteXML,
    buildOsmChangeModifyXML,
    escapeXML,
    parseChangesetCreateResponse,
    parseDiffResult,
    parseOsmChangeXML,
    unescapeXML,
} from '../xml.js';

describe('escapeXML', () => {
    test('escapes every XML attribute metacharacter', () => {
        assert.equal(
            escapeXML(`Market & 5th <"St"> 'corner'`),
            'Market &amp; 5th &lt;&quot;St&quot;&gt; &apos;corner&apos;',
        );
    });

    test('stringifies non-string values', () => {
        assert.equal(escapeXML(171224908), '171224908');
    });
});

describe('unescapeXML', () => {
    test('round-trips escapeXML output', () => {
        const original = `Market & 5th <"St"> 'corner'`;

        assert.equal(unescapeXML(escapeXML(original)), original);
    });

    test('unescapes &amp; last so double-escaped entities survive', () => {
        assert.equal(unescapeXML('&amp;lt;'), '&lt;');
        assert.equal(unescapeXML(escapeXML('&lt;')), '&lt;');
        assert.equal(unescapeXML(escapeXML('&amp;')), '&amp;');
    });

    test('stringifies non-string values', () => {
        assert.equal(unescapeXML(171224908), '171224908');
    });
});

describe('buildChangesetCreateXML', () => {
    test('builds a changeset document from a tag map', () => {
        assert.equal(
            buildChangesetCreateXML({
                comment: 'Added 2 cameras',
                created_by: 'DriversAgainstFlock.org (ios:2.6.0)',
            }),
            '<osm><changeset><tag k="comment" v="Added 2 cameras"/><tag k="created_by" v="DriversAgainstFlock.org (ios:2.6.0)"/></changeset></osm>',
        );
    });

    test('skips null, undefined, and empty tag values', () => {
        assert.equal(
            buildChangesetCreateXML({
                comment: 'Survey',
                hashtags: '',
                source: null,
                unset: undefined,
            }),
            '<osm><changeset><tag k="comment" v="Survey"/></changeset></osm>',
        );
    });

    test('escapes tag values', () => {
        assert.equal(
            buildChangesetCreateXML({ comment: 'Market & 5th "St"' }),
            '<osm><changeset><tag k="comment" v="Market &amp; 5th &quot;St&quot;"/></changeset></osm>',
        );
    });
});

describe('buildOsmChangeCreateXML', () => {
    test('assigns descending placeholder ids and 7-decimal coordinates', () => {
        const xml = buildOsmChangeCreateXML({
            changesetId: 42,
            generator: 'DriversAgainstFlock.org (ios:2.6.0)',
            nodes: [
                {
                    latitude: 37.7841,
                    longitude: -122.4194,
                    tags: { man_made: 'surveillance' },
                },
                {
                    latitude: 37.78361239,
                    longitude: -122.417,
                    tags: { 'surveillance:type': 'ALPR' },
                },
            ],
        });

        assert.equal(
            xml,
            '<osmChange version="0.6" generator="DriversAgainstFlock.org (ios:2.6.0)"><create>' +
                '<node id="-1" changeset="42" lat="37.7841000" lon="-122.4194000">' +
                '<tag k="man_made" v="surveillance"/></node>' +
                '<node id="-2" changeset="42" lat="37.7836124" lon="-122.4170000">' +
                '<tag k="surveillance:type" v="ALPR"/></node>' +
                '</create></osmChange>',
        );
    });

    test('handles an empty node list', () => {
        assert.equal(
            buildOsmChangeCreateXML({
                changesetId: 7,
                generator: 'DriversAgainstFlock.org (android:test)',
                nodes: [],
            }),
            '<osmChange version="0.6" generator="DriversAgainstFlock.org (android:test)"><create></create></osmChange>',
        );
    });
});

describe('buildOsmChangeModifyXML', () => {
    test('builds a modify document with id, version, and full tag set', () => {
        assert.equal(
            buildOsmChangeModifyXML({
                changesetId: 456,
                generator: 'DriversAgainstFlock.org (ios:2.6.0)',
                node: {
                    id: 123,
                    latitude: 37.1234567,
                    longitude: -122.1234567,
                    tags: {
                        direction: '45',
                        man_made: 'surveillance',
                    },
                    version: 3,
                },
            }),
            '<osmChange version="0.6" generator="DriversAgainstFlock.org (ios:2.6.0)"><modify>' +
                '<node id="123" changeset="456" version="3" lat="37.1234567" lon="-122.1234567">' +
                '<tag k="direction" v="45"/><tag k="man_made" v="surveillance"/>' +
                '</node></modify></osmChange>',
        );
    });

    test('skips empty tag values and pads coordinates to 7 decimals', () => {
        assert.equal(
            buildOsmChangeModifyXML({
                changesetId: 9,
                generator: 'test',
                node: {
                    id: 11640217,
                    latitude: 37.78,
                    longitude: -122.4,
                    tags: {
                        direction: '',
                        man_made: 'surveillance',
                        operator: null,
                    },
                    version: 2,
                },
            }),
            '<osmChange version="0.6" generator="test"><modify>' +
                '<node id="11640217" changeset="9" version="2" lat="37.7800000" lon="-122.4000000">' +
                '<tag k="man_made" v="surveillance"/></node></modify></osmChange>',
        );
    });
});

describe('buildOsmChangeDeleteXML', () => {
    test('builds a self-closing delete document without tags', () => {
        assert.equal(
            buildOsmChangeDeleteXML({
                changesetId: 456,
                generator: 'DriversAgainstFlock.org (android:2.6.0)',
                node: {
                    id: 12100881,
                    latitude: 37.7832121,
                    longitude: -122.4074189,
                    version: 1,
                },
            }),
            '<osmChange version="0.6" generator="DriversAgainstFlock.org (android:2.6.0)"><delete>' +
                '<node id="12100881" changeset="456" version="1" lat="37.7832121" lon="-122.4074189"/>' +
                '</delete></osmChange>',
        );
    });
});

describe('parseChangesetCreateResponse', () => {
    test('parses the plain-text changeset id', () => {
        assert.equal(parseChangesetCreateResponse(' 171224908\n'), 171224908);
    });

    test('throws on a non-numeric response', () => {
        assert.throws(
            () => parseChangesetCreateResponse('<html>error</html>'),
            /unexpected changeset response/,
        );
    });
});

describe('parseDiffResult', () => {
    test('parses node elements regardless of attribute order', () => {
        const diff = parseDiffResult(
            '<diffResult generator="OpenStreetMap server" version="0.6">' +
                '<node old_id="-1" new_id="12100881" new_version="1"/>' +
                '<node new_version="1" new_id="12100882" old_id="-2"/>' +
                '</diffResult>',
        );

        assert.deepEqual(diff, [
            { newId: 12100881, newVersion: 1, oldId: -1 },
            { newId: 12100882, newVersion: 1, oldId: -2 },
        ]);
    });

    test('parses non-self-closing node elements', () => {
        const diff = parseDiffResult(
            '<diffResult><node old_id="-1" new_id="55" new_version="1"></node></diffResult>',
        );

        assert.deepEqual(diff, [{ newId: 55, newVersion: 1, oldId: -1 }]);
    });

    test('ignores non-node elements and empty input', () => {
        assert.deepEqual(parseDiffResult('<diffResult></diffResult>'), []);
        assert.deepEqual(parseDiffResult(''), []);
        assert.deepEqual(parseDiffResult(null), []);
    });
});

describe('parseOsmChangeXML', () => {
    test('parses created, modified, and deleted nodes from a download', () => {
        const result = parseOsmChangeXML(
            '<osmChange version="0.6" generator="openstreetmap-cgimap 2.1.0">' +
                '<create>' +
                '<node id="12100881" visible="true" version="1" changeset="171224908" timestamp="2026-07-11T17:02:01Z" user="daf_mapper" uid="21937416" lat="37.7832121" lon="-122.4074189">' +
                '<tag k="man_made" v="surveillance"/><tag k="operator" v="Johnson &amp; Sons"/>' +
                '</node>' +
                '</create>' +
                '<modify>' +
                '<node lon="-122.4310952" lat="37.7683427" version="3" id="11640217" changeset="171000001"/>' +
                '</modify>' +
                '<delete><node id="11538221" version="2" changeset="171000002"/></delete>' +
                '</osmChange>',
        );

        assert.deepEqual(result, {
            created: [
                {
                    id: 12100881,
                    latitude: 37.7832121,
                    longitude: -122.4074189,
                    tags: {
                        man_made: 'surveillance',
                        operator: 'Johnson & Sons',
                    },
                    version: 1,
                },
            ],
            deleted: [
                {
                    id: 11538221,
                    latitude: null,
                    longitude: null,
                    tags: {},
                    version: 2,
                },
            ],
            modified: [
                {
                    id: 11640217,
                    latitude: 37.7683427,
                    longitude: -122.4310952,
                    tags: {},
                    version: 3,
                },
            ],
        });
    });

    test('concatenates nodes across repeated action blocks', () => {
        const result = parseOsmChangeXML(
            '<osmChange version="0.6">' +
                '<create><node id="1" version="1" lat="1.0" lon="2.0"/></create>' +
                '<create><node id="2" version="1" lat="3.5" lon="-4.25"/></create>' +
                '</osmChange>',
        );

        assert.deepEqual(
            result.created.map((node) => node.id),
            [1, 2],
        );
        assert.equal(result.created[1].latitude, 3.5);
        assert.equal(result.created[1].longitude, -4.25);
    });

    test('handles self-closing and paired node elements in one block', () => {
        const result = parseOsmChangeXML(
            '<osmChange><create>' +
                '<node id="10" version="1" lat="1.1" lon="2.2"/>' +
                '<node id="11" version="1" lat="3.3" lon="4.4">' +
                '<tag k="surveillance:type" v="ALPR"/></node>' +
                '</create></osmChange>',
        );

        assert.deepEqual(result.created, [
            { id: 10, latitude: 1.1, longitude: 2.2, tags: {}, version: 1 },
            {
                id: 11,
                latitude: 3.3,
                longitude: 4.4,
                tags: { 'surveillance:type': 'ALPR' },
                version: 1,
            },
        ]);
    });

    test('ignores ways and relations inside blocks', () => {
        const result = parseOsmChangeXML(
            '<osmChange version="0.6"><modify>' +
                '<way id="99" version="4"><nd ref="1"/><tag k="highway" v="residential"/></way>' +
                '<relation id="7" version="2"><member type="way" ref="99" role=""/></relation>' +
                '<node id="5" version="2" lat="37.0" lon="-122.0"><tag k="direction" v="90"/></node>' +
                '</modify></osmChange>',
        );

        assert.deepEqual(result.modified, [
            {
                id: 5,
                latitude: 37,
                longitude: -122,
                tags: { direction: '90' },
                version: 2,
            },
        ]);
        assert.deepEqual(result.created, []);
        assert.deepEqual(result.deleted, []);
    });

    test('parses pretty-printed documents with whitespace', () => {
        const result = parseOsmChangeXML(
            [
                '<osmChange version="0.6" generator="OpenStreetMap server">',
                '  <create>',
                '    <node id="12100881" version="1" lat="37.7832121" lon="-122.4074189">',
                '      <tag k="man_made" v="surveillance"/>',
                '    </node>',
                '  </create>',
                '  <delete if-unused="true">',
                '    <node id="12100882" version="2"/>',
                '  </delete>',
                '</osmChange>',
            ].join('\n'),
        );

        assert.equal(result.created.length, 1);
        assert.deepEqual(result.created[0].tags, { man_made: 'surveillance' });
        assert.deepEqual(result.deleted, [
            {
                id: 12100882,
                latitude: null,
                longitude: null,
                tags: {},
                version: 2,
            },
        ]);
    });

    test('returns empty lists for empty or block-less documents', () => {
        const emptyResult = { created: [], deleted: [], modified: [] };

        assert.deepEqual(parseOsmChangeXML(''), emptyResult);
        assert.deepEqual(parseOsmChangeXML(null), emptyResult);
        assert.deepEqual(
            parseOsmChangeXML('<osmChange version="0.6"/>'),
            emptyResult,
        );
    });
});
