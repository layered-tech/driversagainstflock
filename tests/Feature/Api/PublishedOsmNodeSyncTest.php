<?php

use App\Models\OsmNode;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

const PUBLISHED_OSM_CHANGESET_ID = 171224908;
const PUBLISHED_OSM_NODE_ONE = 12100881;
const PUBLISHED_OSM_NODE_TWO = 12100882;

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function publishedOsmNode(array $overrides = []): array
{
    return array_replace_recursive([
        'type' => 'node',
        'id' => PUBLISHED_OSM_NODE_ONE,
        'lat' => 37.7832121,
        'lon' => -122.4074189,
        'timestamp' => '2026-07-22T18:20:00Z',
        'version' => 1,
        'changeset' => PUBLISHED_OSM_CHANGESET_ID,
        'user' => 'daf_mapper',
        'uid' => 21937416,
        'visible' => true,
        'tags' => [
            'camera:type' => 'fixed',
            'direction' => '45',
            'man_made' => 'surveillance',
            'manufacturer' => 'Flock Safety',
            'surveillance:type' => 'ALPR',
        ],
    ], $overrides);
}

beforeEach(function () {
    $this->withoutMiddleware();

    Http::preventStrayRequests();

    config([
        'services.openstreetmap.api_url' => 'https://openstreetmap.test/api/0.6',
    ]);
});

it('stores current canonical published nodes and returns map points idempotently', function () {
    $secondNode = publishedOsmNode([
        'id' => PUBLISHED_OSM_NODE_TWO,
        'lat' => 37.7838342,
        'lon' => -122.4066227,
        'version' => 3,
        'tags' => [
            'camera:direction' => '225',
            'operator' => 'San Francisco Police Department',
        ],
    ]);
    unset($secondNode['tags']['direction']);

    Http::fake([
        'https://openstreetmap.test/api/0.6/nodes.json*' => Http::response([
            'version' => '0.6',
            'elements' => [
                publishedOsmNode(),
                $secondNode,
            ],
        ]),
    ]);

    $payload = [
        'changeset_id' => PUBLISHED_OSM_CHANGESET_ID,
        'nodes' => [
            ['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 1],
            ['id' => PUBLISHED_OSM_NODE_TWO, 'version' => 3],
        ],
    ];

    $firstResponse = $this->postJson('/api/v1/osm/published-nodes', $payload)
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonCount(2, 'result.points');

    $firstNode = OsmNode::query()->where('osm_id', PUBLISHED_OSM_NODE_ONE)->firstOrFail();
    $secondStoredNode = OsmNode::query()->where('osm_id', PUBLISHED_OSM_NODE_TWO)->firstOrFail();
    $firstInternalId = $firstNode->id;
    $secondInternalId = $secondStoredNode->id;

    expect(OsmNode::query()->count())->toBe(2)
        ->and((float) $firstNode->latitude)->toBe(37.7832121)
        ->and((float) $firstNode->longitude)->toBe(-122.4074189)
        ->and((float) $firstNode->location->latitude)->toBe(37.7832121)
        ->and((float) $firstNode->location->longitude)->toBe(-122.4074189)
        ->and($firstNode->surveillance_type)->toBe('ALPR')
        ->and($firstNode->direction)->toBe('45')
        ->and($firstNode->osm_version)->toBe(1)
        ->and($firstNode->osm_changeset_id)->toBe(PUBLISHED_OSM_CHANGESET_ID)
        ->and($firstNode->osm_user)->toBe('daf_mapper')
        ->and($firstNode->osm_uid)->toBe(21937416)
        ->and($firstNode->osm_updated_at?->toJSON())->toBe('2026-07-22T18:20:00.000000Z')
        ->and($firstNode->last_synced_at)->not->toBeNull()
        ->and($secondStoredNode->camera_direction)->toBe('225')
        ->and($secondStoredNode->direction)->toBeNull()
        ->and($secondStoredNode->osm_version)->toBe(3);

    $pointsByOsmId = collect($firstResponse->json('result.points'))
        ->keyBy('properties.osm_id');

    expect($pointsByOsmId)->toHaveCount(2)
        ->and($pointsByOsmId[PUBLISHED_OSM_NODE_ONE]['location'])->toBe([
            -122.4074189,
            37.7832121,
        ])
        ->and($pointsByOsmId[PUBLISHED_OSM_NODE_ONE]['properties']['id'])->toBe('osm-node-'.$firstInternalId)
        ->and($pointsByOsmId[PUBLISHED_OSM_NODE_ONE]['properties']['osm_nodes'][0]['node_id'])->toBe(PUBLISHED_OSM_NODE_ONE)
        ->and($pointsByOsmId[PUBLISHED_OSM_NODE_ONE]['properties']['osm_nodes'][0]['tags']['surveillance:type'])->toBe('ALPR');

    $this->postJson('/api/v1/osm/published-nodes', $payload)
        ->assertOk()
        ->assertJsonPath('ok', true)
        ->assertJsonCount(2, 'result.points');

    expect(OsmNode::query()->count())->toBe(2)
        ->and(OsmNode::query()->where('osm_id', PUBLISHED_OSM_NODE_ONE)->value('id'))->toBe($firstInternalId)
        ->and(OsmNode::query()->where('osm_id', PUBLISHED_OSM_NODE_TWO)->value('id'))->toBe($secondInternalId);

    Http::assertSentCount(2);
    Http::assertSent(function (Request $request): bool {
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
        $nodeReferences = explode(',', $query['nodes'] ?? '');

        sort($nodeReferences);

        return $request->method() === 'GET'
            && str_starts_with($request->url(), 'https://openstreetmap.test/api/0.6/nodes.json?')
            && $nodeReferences === [
                (string) PUBLISHED_OSM_NODE_ONE,
                (string) PUBLISHED_OSM_NODE_TWO,
            ];
    });
});

it('validates published node references before contacting OpenStreetMap', function (array $payload, array $errors) {
    $this->postJson('/api/v1/osm/published-nodes', $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors($errors);

    Http::assertNothingSent();
})->with([
    'missing changeset' => [
        ['nodes' => [['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 1]]],
        ['changeset_id'],
    ],
    'non-positive changeset' => [
        [
            'changeset_id' => 0,
            'nodes' => [['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 1]],
        ],
        ['changeset_id'],
    ],
    'empty nodes' => [
        ['changeset_id' => PUBLISHED_OSM_CHANGESET_ID, 'nodes' => []],
        ['nodes'],
    ],
    'oversized node batch' => [
        [
            'changeset_id' => PUBLISHED_OSM_CHANGESET_ID,
            'nodes' => array_map(
                fn (int $nodeId): array => ['id' => $nodeId, 'version' => 1],
                range(PUBLISHED_OSM_NODE_ONE, PUBLISHED_OSM_NODE_ONE + 50),
            ),
        ],
        ['nodes'],
    ],
    'invalid node id' => [
        [
            'changeset_id' => PUBLISHED_OSM_CHANGESET_ID,
            'nodes' => [['id' => 0, 'version' => 1]],
        ],
        ['nodes.0.id'],
    ],
    'invalid node version' => [
        [
            'changeset_id' => PUBLISHED_OSM_CHANGESET_ID,
            'nodes' => [['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 0]],
        ],
        ['nodes.0.version'],
    ],
    'duplicate node id' => [
        [
            'changeset_id' => PUBLISHED_OSM_CHANGESET_ID,
            'nodes' => [
                ['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 1],
                ['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 1],
            ],
        ],
        ['nodes.1.id'],
    ],
]);

it('rejects nodes whose canonical metadata does not match the publication', function (array $node, array $requestedNode) {
    Http::fake([
        'https://openstreetmap.test/api/0.6/nodes.json*' => Http::response([
            'elements' => [$node],
        ]),
    ]);

    $this->postJson('/api/v1/osm/published-nodes', [
        'changeset_id' => PUBLISHED_OSM_CHANGESET_ID,
        'nodes' => [$requestedNode],
    ])->assertUnprocessable();

    expect(OsmNode::query()->exists())->toBeFalse();
})->with([
    'changeset mismatch' => [
        publishedOsmNode(['changeset' => PUBLISHED_OSM_CHANGESET_ID + 1]),
        ['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 1],
    ],
    'version mismatch' => [
        publishedOsmNode(['version' => 2]),
        ['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 1],
    ],
    'node id mismatch' => [
        publishedOsmNode(['id' => PUBLISHED_OSM_NODE_TWO]),
        ['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 1],
    ],
]);

it('rejects published nodes that are not ALPR nodes', function () {
    Http::fake([
        'https://openstreetmap.test/api/0.6/nodes.json*' => Http::response([
            'elements' => [publishedOsmNode([
                'tags' => [
                    'surveillance:type' => 'camera',
                ],
            ])],
        ]),
    ]);

    $this->postJson('/api/v1/osm/published-nodes', [
        'changeset_id' => PUBLISHED_OSM_CHANGESET_ID,
        'nodes' => [['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 1]],
    ])->assertUnprocessable();

    expect(OsmNode::query()->exists())->toBeFalse();
});

it('returns a bad gateway response when OpenStreetMap cannot load the published nodes', function () {
    Http::fake([
        'https://openstreetmap.test/api/0.6/nodes.json*' => Http::response([
            'message' => 'Service unavailable',
        ], 503),
    ]);

    $this->postJson('/api/v1/osm/published-nodes', [
        'changeset_id' => PUBLISHED_OSM_CHANGESET_ID,
        'nodes' => [['id' => PUBLISHED_OSM_NODE_ONE, 'version' => 1]],
    ])->assertStatus(502);

    expect(OsmNode::query()->exists())->toBeFalse();
});
