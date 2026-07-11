import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    buildChangesetCreateXML,
    buildOsmChangeCreateXML,
    escapeXML,
    parseChangesetCreateResponse,
    parseDiffResult,
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
