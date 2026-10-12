import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    getCameraDetailsFromTags,
    getCameraFormTags,
    getPresetTags,
    tagsToRows,
    validateCameraTagRows,
} from '../camera-presets.js';
import { buildOsmChangeXML } from '../xml.js';
import { parseNodeDetails } from '../edit-tags.js';

test('vendor presets write six standard tags and generic omits the manufacturer', () => {
    for (const [preset, manufacturer] of Object.entries({
        flock: 'Flock Safety',
        motorola: 'Motorola Solutions',
        genetec: 'Genetec',
        axon: 'Axon',
    })) {
        const tags = getPresetTags(preset);
        assert.equal(tags.manufacturer, manufacturer);
        assert.equal(tags['surveillance:type'], 'ALPR');
        assert.equal(Object.keys(tags).length, 6);
    }
    assert.equal(getPresetTags('generic').manufacturer, undefined);
});

test('camera form publishes directions, optional mount and extra tags', () => {
    const tags = getCameraFormTags({
        preset: 'axon',
        operator: '  City  ',
        directions: [90, 270],
        mount: 'pole',
        extraTags: [{ key: 'description', value: 'Faces inbound Market St' }],
    });
    assert.equal(tags['camera:direction'], '90;270');
    assert.equal(tags.direction, undefined);
    assert.equal(tags.operator, 'City');
    assert.equal(tags['camera:mount'], 'pole');
    assert.equal(tags.description, 'Faces inbound Market St');
});

test('custom tag mode preserves all values and does not insert preset tags', () => {
    const original = {
        man_made: 'surveillance',
        'surveillance:type': 'camera',
        'camera:direction': 'NW',
        description: '  Keep spacing  ',
        custom_unknown: 'yes',
    };
    assert.deepEqual(
        getCameraFormTags({
            preset: 'custom',
            rawTags: tagsToRows(original),
            operator: 'Do not add',
        }),
        original,
    );
    assert.equal(validateCameraTagRows(tagsToRows(original)), null);
    assert.match(
        validateCameraTagRows([
            { key: 'a', value: 'x' },
            { key: ' a ', value: 'y' },
        ]),
        /unique/,
    );
    assert.match(
        validateCameraTagRows([{ key: 'ref', value: '' }]),
        /key and a value/,
    );
});

test('reads both legacy and design camera direction tags with design precedence', () => {
    assert.deepEqual(
        parseNodeDetails({ direction: '40', 'camera:direction': '90;270' })
            .directions,
        [90, 270],
    );
    assert.deepEqual(parseNodeDetails({ direction: '40' }).directions, [40]);
});

test('uploads additions edits and deletions in one changeset with correct versions', () => {
    const xml = buildOsmChangeXML({
        changesetId: 42,
        generator: 'DAF',
        nodes: [{ latitude: 30, longitude: -97, tags: getPresetTags('flock') }],
        modifiedNodes: [
            {
                id: 123,
                version: 3,
                latitude: 31,
                longitude: -98,
                tags: { man_made: 'surveillance', description: 'A&B' },
            },
        ],
        deletedNodes: [{ id: 456, version: 2, latitude: 32, longitude: -99 }],
    });
    assert.match(xml, /<create><node id="-1" changeset="42"/);
    assert.match(xml, /<modify><node id="123" changeset="42" version="3"/);
    assert.match(xml, /v="A&amp;B"/);
    assert.match(xml, /<delete><node id="456" changeset="42" version="2"/);
    assert.equal((xml.match(/<osmChange/g) ?? []).length, 1);
});

for (const preset of ['flock', 'motorola', 'genetec', 'axon', 'generic']) {
    test(`existing ${preset} tags reselect the preset without changing original tags`, () => {
        const tags = {
            ...getPresetTags(preset),
            direction: '090; 270',
            operator: ' City ',
            'camera:mount': 'unusual-mount',
            note: 'Keep me',
        };
        const details = getCameraDetailsFromTags(tags);
        assert.equal(details.preset, preset);
        assert.deepEqual(getCameraFormTags(details), tags);
        const changed = getCameraFormTags({
            ...details,
            directions: [180],
            operator: 'New city',
        });
        assert.equal(changed['camera:direction'], '180');
        assert.equal(changed.direction, undefined);
        assert.equal(changed.operator, 'New city');
        assert.equal(changed.note, 'Keep me');
    });
}

test('a different surveillance profile remains custom and preserves every tag', () => {
    const tags = { ...getPresetTags('flock'), 'surveillance:type': 'camera' };
    const details = getCameraDetailsFromTags(tags);
    assert.equal(details.preset, 'custom');
    assert.deepEqual(getCameraFormTags(details), tags);
});
