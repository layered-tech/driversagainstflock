import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createEmptyPrimaryLocations,
    createPrimaryLocationDirectionsWaypoint,
    getPrimaryLocationTypeToOffer,
    getSuggestedPrimaryLocationType,
    parseStoredPrimaryLocations,
    PRIMARY_LOCATION_HOME,
    PRIMARY_LOCATION_WORK,
    updatePrimaryLocations,
} from '../primary-locations.js';

const normalizeLocation = (location) =>
    location?.id ? { ...location, normalized: true } : null;

describe('primary location place classification', () => {
    test('suggests Home for residential address types', () => {
        assert.equal(
            getSuggestedPrimaryLocationType({
                primaryType: 'street_address',
                types: ['street_address', 'premise'],
            }),
            PRIMARY_LOCATION_HOME,
        );
        assert.equal(
            getSuggestedPrimaryLocationType({
                businessStatus: 'OPERATIONAL',
                primaryType: 'apartment_building',
                types: ['apartment_building', 'establishment'],
            }),
            PRIMARY_LOCATION_HOME,
        );
    });

    test('suggests Work only for machine-readable business signals', () => {
        assert.equal(
            getSuggestedPrimaryLocationType({
                businessStatus: 'OPERATIONAL',
                primaryType: 'department_store',
            }),
            PRIMARY_LOCATION_WORK,
        );
        assert.equal(
            getSuggestedPrimaryLocationType({
                businessStatus: 'OPERATIONAL',
                primaryType: 'premise',
                types: ['premise', 'establishment'],
            }),
            PRIMARY_LOCATION_WORK,
        );
        assert.equal(
            getSuggestedPrimaryLocationType({
                primaryType: 'grocery_store',
                types: ['grocery_store', 'establishment'],
            }),
            PRIMARY_LOCATION_WORK,
        );
        assert.equal(
            getSuggestedPrimaryLocationType({
                primaryType: 'locality',
                primaryTypeDisplayName: { text: 'Business district' },
            }),
            null,
        );
    });

    test('suppresses occupied slots and honors an explicit setup intent', () => {
        const workLocation = { id: 'work' };

        assert.equal(
            getPrimaryLocationTypeToOffer({
                place: { primaryType: 'street_address' },
                primaryLocations: {
                    home: { id: 'home' },
                    work: null,
                },
            }),
            null,
        );
        assert.equal(
            getPrimaryLocationTypeToOffer({
                place: { primaryType: 'street_address' },
                preferredType: PRIMARY_LOCATION_WORK,
                primaryLocations: { home: null, work: null },
            }),
            PRIMARY_LOCATION_WORK,
        );
        assert.equal(
            getPrimaryLocationTypeToOffer({
                place: { businessStatus: 'OPERATIONAL' },
                primaryLocations: { home: null, work: workLocation },
            }),
            null,
        );
    });
});

describe('primary location persistence model', () => {
    test('fails closed for empty, malformed, and invalid stored values', () => {
        const emptyLocations = createEmptyPrimaryLocations();

        assert.deepEqual(
            parseStoredPrimaryLocations(null, normalizeLocation),
            emptyLocations,
        );
        assert.deepEqual(
            parseStoredPrimaryLocations('{bad json', normalizeLocation),
            emptyLocations,
        );
        assert.deepEqual(
            parseStoredPrimaryLocations('[]', normalizeLocation),
            emptyLocations,
        );
    });

    test('normalizes, replaces, and clears each named slot independently', () => {
        const parsedLocations = parseStoredPrimaryLocations(
            JSON.stringify({
                home: { id: 'home-1', name: 'Old home' },
                work: { id: 'work-1', name: 'Office' },
            }),
            normalizeLocation,
        );
        const replacedLocations = updatePrimaryLocations(
            parsedLocations,
            PRIMARY_LOCATION_HOME,
            { id: 'home-2', name: 'New home' },
            normalizeLocation,
        );
        const clearedLocations = updatePrimaryLocations(
            replacedLocations,
            PRIMARY_LOCATION_WORK,
            null,
            normalizeLocation,
        );

        assert.deepEqual(parsedLocations.home, {
            id: 'home-1',
            name: 'Old home',
            normalized: true,
        });
        assert.equal(replacedLocations.home.id, 'home-2');
        assert.equal(replacedLocations.work.id, 'work-1');
        assert.equal(clearedLocations.home.id, 'home-2');
        assert.equal(clearedLocations.work, null);
    });
});

describe('primary location directions waypoint', () => {
    test('builds a complete route destination directly from stored coordinates', () => {
        const waypoint = createPrimaryLocationDirectionsWaypoint(
            PRIMARY_LOCATION_WORK,
            {
                address: '1 Market St, Austin, TX',
                id: 'office',
                latitude: '30.2672',
                longitude: '190',
                name: 'DAF Office',
                placeId: 'office-place',
                typeLabel: 'Corporate office',
            },
        );

        assert.equal(waypoint.label, 'Work');
        assert.equal(waypoint.inputValue, '1 Market St, Austin, TX');
        assert.deepEqual(waypoint.location, {
            latitude: 30.2672,
            longitude: -170,
        });
        assert.equal(waypoint.placeId, 'office-place');
        assert.equal(waypoint.result.primaryText, 'DAF Office');
        assert.equal(
            waypoint.subtitle,
            'Corporate office - 1 Market St, Austin, TX',
        );
    });

    test('rejects missing or invalid destination coordinates', () => {
        assert.equal(
            createPrimaryLocationDirectionsWaypoint(PRIMARY_LOCATION_HOME, {
                id: 'home',
                name: 'Home',
            }),
            null,
        );
        assert.equal(
            createPrimaryLocationDirectionsWaypoint(PRIMARY_LOCATION_HOME, {
                id: 'home',
                latitude: 95,
                longitude: -97,
                name: 'Home',
            }),
            null,
        );
    });
});
