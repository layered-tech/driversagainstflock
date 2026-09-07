<?php

use App\Models\WatchedArea;
use Illuminate\Routing\Middleware\ThrottleRequestsWithRedis;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);
beforeEach(function (): void {
    $this->createModerationSource();
    $this->moderator();
    config(['inertia.ssr.enabled' => false]);
});
function watchedAreaInput(): array
{
    return ['name' => 'Austin metro', 'kind' => 'bbox', 'definition' => '30,-98 → 31,-97', 'geometry' => ['type' => 'Polygon', 'coordinates' => [[[-98, 30], [-97, 30], [-97, 31], [-98, 31], [-98, 30]]]]];
}
test('moderators create geographic areas and subscribe automatically', function () {
    $this->post('/moderation/areas', watchedAreaInput())->assertRedirect(route('moderation.index', ['view' => 'areas']));
    $area = WatchedArea::firstOrFail();
    expect($area->bounds)->toBe([-98, 30, -97, 31])->and($area->watchers->pluck('id')->all())->toBe([auth()->id()]);
    $this->assertDatabaseHas('moderation_activities', ['action' => 'area.created']);
});
test('invalid geographic boundaries cannot be saved', function (array $coordinates) {
    $input = watchedAreaInput();
    $input['geometry']['coordinates'] = [$coordinates];
    $this->post('/moderation/areas', $input)->assertSessionHasErrors('geometry');
    $this->assertDatabaseCount('watched_areas', 0);
})->with([
    'out of range' => [[[-198, 30], [-97, 30], [-97, 31], [-198, 30]]],
    'unclosed' => [[[-98, 30], [-97, 30], [-97, 31], [-98, 31]]],
    'self crossing' => [[[-98, 30], [-97, 31], [-98, 31], [-97, 30], [-98, 30]]],
    'too few points' => [[[-98, 30], [-97, 30], [-98, 30]]],
]);
test('subscriptions persist and removal is audited', function () {
    $this->post('/moderation/areas', watchedAreaInput());
    $area = WatchedArea::firstOrFail();
    $this->post('/moderation/areas/'.$area->id.'/subscription')->assertRedirect();
    expect($area->watchers()->count())->toBe(1);
    $this->delete('/moderation/areas/'.$area->id.'/subscription')->assertRedirect();
    expect($area->watchers()->count())->toBe(0);
    $this->delete('/moderation/areas/'.$area->id)->assertRedirect();
    $this->assertDatabaseMissing('watched_areas', ['id' => $area->id]);
    $this->assertDatabaseHas('moderation_activities', ['action' => 'area.removed']);
});
test('watched geometry filters live changesets and node coordinates', function () {
    $this->post('/moderation/areas', watchedAreaInput());
    $area = WatchedArea::firstOrFail();
    $this->sourceChangeset();
    $this->sourceNode();
    $this->sourceChangeset(101, ['min_lon' => 1, 'min_lat' => 1, 'max_lon' => 2, 'max_lat' => 2]);
    $this->get('/moderation/areas/'.$area->id)->assertOk()->assertJson(['open_flags' => null, 'changesets_7d' => 1, 'flagged_changesets' => 0]);
});
test('boundary lookup handles upstream failures without saving an area', function () {
    $this->withoutMiddleware(ThrottleRequestsWithRedis::class);
    Http::preventStrayRequests();
    Http::fake(['nominatim.openstreetmap.org/*' => Http::failedConnection()]);
    $this->getJson('/moderation/areas/search?query=Austin&kind=county')->assertStatus(503);
    $this->assertDatabaseCount('watched_areas', 0);
});

test('areas list includes live activity totals in bulk', function () {
    $area = WatchedArea::factory()->create();
    $this->sourceChangeset();
    $this->sourceNode();
    $this->get('/moderation?view=areas')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->where('records.data.0.id', $area->id)->where('records.data.0.open_flags', null)->where('records.data.0.changesets_7d', 1)->where('records.data.0.flagged_changesets', 0));
});
