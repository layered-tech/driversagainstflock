<?php

use App\Models\ApiLog;
use App\Models\AreaDevice;
use App\Models\AreaSubscription;
use App\Models\OsmNode;
use Illuminate\Routing\Middleware\ThrottleRequestsWithRedis;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use MatanYadaev\EloquentSpatial\Objects\Point;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);

beforeEach(function (): void {
    $this->createModerationSource();
    $this->withoutMiddleware(ThrottleRequestsWithRedis::class);
    $this->deviceToken = str_repeat('a', 64);
    $this->device = AreaDevice::factory()->create(['token_hash' => hash('sha256', $this->deviceToken)]);
    $this->withToken($this->deviceToken);
});

function personalAreaInput(): array
{
    return AreaSubscription::factory()->make()->only(['name', 'kind', 'definition', 'geometry']);
}

test('anonymous devices receive a secret without an account or exposed stored tokens', function () {
    $token = $this->postJson('/api/v1/area-devices')->assertCreated()->json('token');
    expect(strlen($token))->toBe(64);
    $device = AreaDevice::where('token_hash', hash('sha256', $token))->firstOrFail();
    expect($device->toArray())->not->toHaveKey('token_hash')->not->toHaveKey('push_token');
    $this->withToken('invalid')->getJson('/api/v1/areas')->assertUnauthorized();
});

test('subscriptions are device scoped, idempotent, and removable', function () {
    $input = personalAreaInput();
    $id = $this->postJson('/api/v1/areas', $input)->assertCreated()->json('area.id');
    $this->postJson('/api/v1/areas', $input)->assertCreated()->assertJsonPath('area.id', $id);
    $this->getJson('/api/v1/areas')->assertOk()->assertJsonCount(1, 'areas');
    $other = AreaSubscription::factory()->create();
    $this->getJson('/api/v1/areas/'.$other->id.'/changes')->assertNotFound();
    $this->patchJson('/api/v1/areas/'.$other->id, ['name' => 'Stolen'])->assertNotFound();
    $this->deleteJson('/api/v1/areas/'.$other->id)->assertNotFound();
    $this->deleteJson('/api/v1/areas/'.$id)->assertOk();
    $this->assertDatabaseMissing('area_subscriptions', ['id' => $id]);
});

test('boundaries and notification settings are validated', function () {
    $input = personalAreaInput();
    $input['geometry']['coordinates'] = [[[-98, 30], [-97, 31], [-98, 31], [-97, 30], [-98, 30]]];
    $this->postJson('/api/v1/areas', $input)->assertUnprocessable()->assertJsonValidationErrors('geometry');
    $area = AreaSubscription::factory()->for($this->device, 'device')->create();
    $this->patchJson('/api/v1/areas/'.$area->id, ['alert_mode' => 'hourly', 'digest_time' => '28:00'])->assertUnprocessable();
    $this->patchJson('/api/v1/areas/'.$area->id, ['alert_mode' => 'weekly', 'digest_time' => '07:30', 'notify_removed' => false])->assertOk()->assertJsonPath('area.alert_mode', 'weekly')->assertJsonPath('area.notify_removed', false);
    $this->patchJson('/api/v1/areas/device', ['push_token' => 'arbitrary', 'timezone' => 'invalid'])->assertUnprocessable();
});

test('feeds distinguish additions, removals, edits and unknown history using prior coordinates', function () {
    $area = AreaSubscription::factory()->for($this->device, 'device')->create();
    $this->sourceNode(1, 1);
    $this->sourceNode(1, 2, ['tags' => json_encode(['surveillance:type' => 'ALPR', 'operator' => 'Flock'])]);
    $this->sourceNode(2, 1, ['osm_updated_at' => now()->subDays(40)]);
    $this->sourceNode(2, 2, ['visible' => false, 'tags' => '{}', 'latitude' => null, 'longitude' => null, 'geom' => null]);
    $this->sourceNode(3, 4);
    $this->sourceNode(4, 1, ['latitude' => 1, 'longitude' => 1]);
    $this->sourceNode(5, 1, ['tags' => '{}']);
    $this->sourceNode(5, 2);
    $feed = $this->getJson('/api/v1/areas/'.$area->id.'/changes')->assertOk()->assertJsonPath('counts.added', 2)->assertJsonPath('counts.removed', 1)->assertJsonCount(3, 'changes.data');
    $removed = collect($feed->json('changes.data'))->firstWhere('kind', 'removed');
    expect($removed['longitude'])->toBe(-97.5)->and($removed['latitude'])->toBe(30.5);
    $this->getJson('/api/v1/areas')->assertJsonPath('areas.0.unread_count', 3);
    $this->postJson('/api/v1/areas/'.$area->id.'/read', ['through_id' => $feed->json('read_through_id')])->assertOk();
    $this->sourceNode(6);
    $this->getJson('/api/v1/areas')->assertJsonPath('areas.0.unread_count', 1);
    $this->getJson('/api/v1/areas/'.$area->id.'/changes/'.$removed['id'])->assertOk()->assertJsonPath('change.kind', 'removed');
});

test('feed windows, polygon holes and camera counts respect the actual boundary', function () {
    $input = personalAreaInput();
    $input['geometry']['coordinates'][] = [[-97.8, 30.2], [-97.2, 30.2], [-97.2, 30.8], [-97.8, 30.8], [-97.8, 30.2]];
    $id = $this->postJson('/api/v1/areas', $input)->assertCreated()->json('area.id');
    $this->sourceNode(1);
    $this->sourceNode(2, 1, ['longitude' => -97.9, 'osm_updated_at' => now()->subDays(3)]);
    $this->getJson('/api/v1/areas/'.$id.'/changes?window=24h')->assertJsonCount(0, 'changes.data');
    $this->getJson('/api/v1/areas/'.$id.'/changes?window=7')->assertJsonCount(1, 'changes.data');
    OsmNode::create(['osm_id' => 123, 'longitude' => -97.9, 'latitude' => 30.5, 'location' => new Point(30.5, -97.9)]);
    $this->postJson('/api/v1/areas/preview', $input)->assertOk()->assertJsonPath('camera_count', 1);
});

test('area search returns polygon boundaries and handles upstream failures', function () {
    Http::preventStrayRequests();
    Http::fake(['nominatim.openstreetmap.org/*' => Http::response([
        ['name' => 'Austin', 'display_name' => 'Austin, TX', 'addresstype' => 'city', 'geojson' => personalAreaInput()['geometry']],
        ['name' => 'A shop', 'geojson' => ['type' => 'Point', 'coordinates' => [-97, 30]]],
    ])]);
    $this->getJson('/api/v1/areas/search?query=Austin')->assertOk()->assertJsonCount(1, 'results')->assertJsonPath('results.0.kind', 'city');
    Cache::forget('moderation-nominatim-rate');
    Http::fake(['nominatim.openstreetmap.org/*' => Http::failedConnection()]);
    $this->getJson('/api/v1/areas/search?query=Chicago')->assertStatus(503);
});

test('ZIP searches return watchable Census boundaries and bypass old empty search caches', function (string $query) {
    Http::preventStrayRequests();
    $geometry = personalAreaInput()['geometry'];
    Cache::put('mobile-area-search:'.hash('sha256', $query), [], now()->addDay());
    Http::fake(['tigerweb.geo.census.gov/*' => Http::response([
        'type' => 'FeatureCollection',
        'features' => [['properties' => ['ZCTA5' => '00501'], 'geometry' => $geometry]],
    ])]);

    $result = $this->getJson('/api/v1/areas/search?'.http_build_query(['query' => $query]))
        ->assertOk()->assertJsonCount(1, 'results')
        ->assertJsonPath('results.0.name', '00501')->assertJsonPath('results.0.kind', 'zip')
        ->assertJsonPath('results.0.geometry', $geometry)->json('results.0');
    $this->postJson('/api/v1/areas', $result)->assertCreated()->assertJsonPath('area.kind', 'zip');
    $this->getJson('/api/v1/areas/search?query=00501')->assertOk()->assertJsonCount(1, 'results');
    Http::assertSentCount(1);
    Http::assertSent(fn ($request): bool => $request['where'] === "ZCTA5='00501'" && $request['outSR'] === 4326 && $request['f'] === 'geojson');
})->with(['00501', '00501-1234', ' ZIP 00501 ']);

test('ZIP search handles missing boundaries and provider errors without substituting a point or box', function () {
    Http::preventStrayRequests();
    Http::fake(['tigerweb.geo.census.gov/*' => Http::sequence()
        ->push(['type' => 'FeatureCollection', 'features' => []])
        ->push(['error' => ['message' => 'Service unavailable']])
        ->push(['type' => 'FeatureCollection', 'features' => [['geometry' => personalAreaInput()['geometry']]]])]);

    $this->getJson('/api/v1/areas/search?query=00000')->assertOk()->assertJsonCount(0, 'results');
    $this->getJson('/api/v1/areas/search?query=53089')->assertStatus(503);
    $this->getJson('/api/v1/areas/search?query=53089')->assertOk()->assertJsonCount(1, 'results');
});

test('ZIP search handles connection failures', function () {
    Http::preventStrayRequests();
    Http::fake(['tigerweb.geo.census.gov/*' => Http::failedConnection()]);

    $this->getJson('/api/v1/areas/search?query=53089')->assertStatus(503);
});

test('area secrets and boundaries never enter API payload logs', function () {
    $this->postJson('/api/v1/areas', personalAreaInput())->assertCreated();
    $log = ApiLog::latest('id')->firstOrFail();
    expect($log->request_payload)->toBe(['redacted' => true])->and($log->response_payload)->toBe(['redacted' => true]);
});

test('refreshing the same device timezone preserves the scheduled digest', function () {
    $area = AreaSubscription::factory()->for($this->device, 'device')->create(['alert_mode' => 'daily', 'next_digest_at' => now()->addHour()]);
    $scheduled = $area->next_digest_at;
    $this->patchJson('/api/v1/areas/device', ['timezone' => $this->device->timezone, 'push_token' => 'ExpoPushToken[test]'])->assertOk();
    expect($area->fresh()->next_digest_at->equalTo($scheduled))->toBeTrue();
});

test('area list counters follow the selected time window', function () {
    AreaSubscription::factory()->for($this->device, 'device')->create();
    $this->sourceNode(1, 1, ['osm_updated_at' => now()->subDays(3)]);
    $this->sourceNode(2, 1, ['osm_updated_at' => now()->subDays(20)]);
    $this->getJson('/api/v1/areas?window=24h')->assertJsonPath('areas.0.counts.added', 0);
    $this->getJson('/api/v1/areas?window=7')->assertJsonPath('areas.0.counts.added', 1);
    $this->getJson('/api/v1/areas?window=30')->assertJsonPath('areas.0.counts.added', 2);
});

test('the area map returns every current camera across pages inside its boundary', function (): void {
    $geometry = personalAreaInput()['geometry'];
    $geometry['coordinates'][] = [[-97.8, 30.2], [-97.2, 30.2], [-97.2, 30.8], [-97.8, 30.8], [-97.8, 30.2]];
    $area = AreaSubscription::factory()->for($this->device, 'device')->create(['geometry' => $geometry]);
    for ($id = 1; $id <= 501; $id++) {
        OsmNode::create(['osm_id' => $id, 'longitude' => -97.9, 'latitude' => 30.5, 'location' => new Point(30.5, -97.9), 'osm_updated_at' => now()->subYears(2)]);
    }
    foreach ([[-97.5, 30.5], [-96, 30.5]] as $index => [$longitude, $latitude]) {
        OsmNode::create(['osm_id' => 1000 + $index, 'longitude' => $longitude, 'latitude' => $latitude, 'location' => new Point($latitude, $longitude)]);
    }
    $this->sourceNode(2000, 1);
    $this->sourceNode(2000, 2, ['visible' => false]);

    $this->getJson('/api/v1/areas/'.$area->id.'/cameras')->assertOk()
        ->assertJsonPath('area.id', $area->id)->assertJsonPath('area.geometry', $geometry)
        ->assertJsonPath('cameras.total', 501)->assertJsonCount(500, 'cameras.data')
        ->assertJsonPath('cameras.data.0', ['id' => 1, 'kind' => 'current', 'longitude' => -97.9, 'latitude' => 30.5]);
    $this->getJson('/api/v1/areas/'.$area->id.'/cameras?page=2')->assertOk()
        ->assertJsonCount(1, 'cameras.data')->assertJsonPath('cameras.data.0.id', 501);
    $other = AreaSubscription::factory()->create();
    $this->getJson('/api/v1/areas/'.$other->id.'/cameras')->assertNotFound();
    $this->getJson('/api/v1/areas/'.$area->id.'/cameras?page=0')->assertUnprocessable();
});
