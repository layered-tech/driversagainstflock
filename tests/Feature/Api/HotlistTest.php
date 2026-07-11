<?php

use App\Models\OsmNode;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Route;
use MatanYadaev\EloquentSpatial\Objects\Point;

function createMobileHotlistOsmNode(
    int $osmId,
    Carbon $osmUpdatedAt,
    array $tags,
    string $surveillanceType = 'ALPR',
): OsmNode {
    $latitude = 43 + (($osmId - 12379768000) / 100000);
    $longitude = -88 - (($osmId - 12379768000) / 100000);

    return OsmNode::query()->create([
        'osm_id' => $osmId,
        'latitude' => $latitude,
        'longitude' => $longitude,
        'location' => new Point($latitude, $longitude),
        'tags' => $tags,
        'surveillance_type' => $surveillanceType,
        'osm_updated_at' => $osmUpdatedAt,
        'osm_version' => 1,
        'osm_changeset_id' => 987654321,
        'osm_user' => 'mapper-one',
        'osm_uid' => 1234567,
        'last_synced_at' => now(),
    ]);
}

it('returns the mobile hotlist payload with recent node rows', function () {
    $this->travelTo('2026-06-24 12:00:00');

    $osmUpdatedAt = now()->subHours(3);

    createMobileHotlistOsmNode(12379768752, $osmUpdatedAt, [
        'operator' => 'Flock Safety',
        'addr:housenumber' => '2401',
        'addr:street' => 'W Bluemound Rd',
        'addr:city' => 'Waukesha',
        'surveillance:type' => 'ALPR',
    ]);

    $this->getJson('/api/v1/hotlist')
        ->assertOk()
        ->assertJsonPath('nodes.total', 1)
        ->assertJsonPath('nodes.perPage', 25)
        ->assertJsonPath('nodes.data.0.osmId', 12379768752)
        ->assertJsonPath('nodes.data.0.type', 'alpr')
        ->assertJsonPath('nodes.data.0.typeLabel', 'ALPR reader')
        ->assertJsonPath('nodes.data.0.operator', 'Flock Safety')
        ->assertJsonPath('nodes.data.0.street', '2401 W Bluemound Rd')
        ->assertJsonPath('nodes.data.0.city', 'Waukesha')
        ->assertJsonPath('nodes.data.0.updatedAt', $osmUpdatedAt->toJSON())
        ->assertJsonPath('filters.window', '7')
        ->assertJsonPath('filters.manufacturer', 'all')
        ->assertJsonPath('filters.sort', 'updated')
        ->assertJsonPath('manufacturerCounts.all', 1)
        ->assertJsonPath('manufacturerCounts.flock', 1)
        ->assertJsonPath('manufacturerCounts.other', 0)
        ->assertJsonPath('stats.0.label', 'Added last 7 days')
        ->assertJsonPath('stats.0.value', '1')
        ->assertJsonCount(4, 'stats');
});

it('supports the mobile hotlist filters and counts', function () {
    $this->travelTo('2026-06-24 12:00:00');

    createMobileHotlistOsmNode(12379768753, now()->subDay(), [
        'operator' => 'Flock Safety',
        'name' => 'W Bluemound Rd',
        'addr:city' => 'Waukesha',
        'surveillance:type' => 'ALPR',
    ]);

    createMobileHotlistOsmNode(12379768754, now()->subHours(2), [
        'operator' => 'City Traffic',
        'name' => 'Main St',
        'addr:city' => 'Milwaukee',
        'surveillance:type' => 'camera',
    ], 'camera');

    $this->getJson('/api/v1/hotlist?manufacturer=other&query=Milwaukee&sort=city&direction=asc')
        ->assertOk()
        ->assertJsonPath('nodes.total', 1)
        ->assertJsonPath('nodes.data.0.type', 'camera')
        ->assertJsonPath('nodes.data.0.manufacturer', 'City Traffic')
        ->assertJsonPath('nodes.data.0.city', 'Milwaukee')
        ->assertJsonPath('filters.manufacturer', 'other')
        ->assertJsonPath('filters.query', 'Milwaukee')
        ->assertJsonPath('filters.sort', 'city')
        ->assertJsonPath('filters.direction', 'asc')
        ->assertJsonPath('manufacturerCounts.all', 2)
        ->assertJsonPath('manufacturerCounts.flock', 1)
        ->assertJsonPath('manufacturerCounts.other', 1);
});

it('uses the hotlist throttle middleware', function () {
    $route = Route::getRoutes()->match(Request::create('/api/v1/hotlist', 'GET'));

    expect($route->gatherMiddleware())->toContain('throttle:hotlist')
        ->and(file_get_contents(app_path('Providers/AppServiceProvider.php')))
        ->toContain("RateLimiter::for('hotlist'")
        ->toContain('Limit::perMinute(100)->perHour(300)');
});
