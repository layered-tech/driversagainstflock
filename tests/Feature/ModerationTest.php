<?php

use App\Models\User;
use App\Services\OpenStreetMap\ModerationReader;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);
beforeEach(function (): void {
    $this->createModerationSource();
});
test('moderation requires a verified approved OSM session on every endpoint', function () {
    $this->get('/moderation')->assertRedirect('/login');
    $user = User::factory()->create(['email' => 'pfeifer.christopher@gmail.com']);
    $this->actingAs($user)->get('/moderation')->assertForbidden();
    $user = $this->moderator();
    config(['moderation.approved_osm_ids' => []]);
    $this->get('/moderation')->assertForbidden();
    $this->get('/moderation/changesets/100')->assertForbidden();
    $this->patch('/moderation/nodes/200/review')->assertForbidden();
    $this->post('/moderation/areas')->assertForbidden();
    $this->get('/moderation/areas/search')->assertForbidden();
    $this->get('/moderation?view=audit')->assertForbidden();
});
test('approved moderators can filter and paginate live changesets', function () {
    $this->moderator();
    foreach (range(1, 201) as $id) {
        $this->sourceChangeset($id);
    }
    $this->get('/moderation?view=changesets')->assertInertia(fn (Assert $page) => $page->component('Moderation/Index')->has('records.data', 200)->missing('records.total')->where('records.next_page_url', fn ($url) => $url !== null)->where('source.state', 'ready'));
    $this->get('/moderation?view=changesets&page=2')->assertInertia(fn (Assert $page) => $page->has('records.data', 1));
    $this->get('/moderation?view=changesets&changeset=1')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->where('records.data.0.id', 1));
    $this->get('/moderation?sort=unsafe')->assertSessionHasErrors('sort');
});
test('reviews are audited locally and do not write OSM data', function () {
    $this->moderator();
    $this->sourceChangeset();
    $row = app(ModerationReader::class)->changesets()->first();
    $this->from('/moderation?view=changesets')->patch('/moderation/changesets/100/review', ['revision' => $row->revision, 'status' => 'Reviewed'])->assertRedirect();
    $this->assertDatabaseHas('moderation_reviews', ['subject_id' => 100, 'status' => 'Reviewed']);
    $this->assertDatabaseHas('moderation_activities', ['action' => 'changeset.reviewed', 'subject_id' => 100]);
    expect(DB::table('testing_changesets')->value('alpr_nodes_created'))->toBe(2);
});
test('stale revisions and source failures cannot save decisions', function () {
    $this->moderator();
    $this->sourceChangeset();
    $this->patch('/moderation/changesets/100/review', ['revision' => str_repeat('x', 32), 'status' => 'Reviewed'])->assertSessionHasErrors('review');
    $this->assertDatabaseCount('moderation_reviews', 0);
    config(['osm.reader.changesets_table' => 'source_not_ready']);
    $this->get('/moderation?view=changesets')->assertInertia(fn (Assert $page) => $page->where('source.state', 'unavailable')->has('records.data', 0));
});

test('node dismissals are persistent and idempotent', function () {
    $this->moderator();
    $this->sourceNode();
    $node = app(ModerationReader::class)->listing('nodes', [])->first();
    for ($attempt = 0; $attempt < 2; $attempt++) {
        $this->patch('/moderation/nodes/200/review', ['revision' => $node->revision, 'status' => 'Dismissed'])->assertRedirect();
    }
    $this->assertDatabaseHas('moderation_reviews', ['subject_id' => 200, 'subject_type' => 'node', 'status' => 'Dismissed']);
    $this->assertDatabaseCount('moderation_activities', 1);
});

test('OSM approval alone is insufficient without a verified OSM login session', function () {
    $user = $this->moderator();
    $this->withSession(['osm_authenticated_uid' => '999'])->get('/moderation')->assertForbidden();
    $this->withSession(['osm_authenticated_uid' => null])->patch('/moderation/changesets/100/review')->assertForbidden();
});

test('loading moderation nodes and changesets does not run aggregate queries', function (string $view) {
    $this->moderator();
    $this->sourceNode();
    $this->sourceChangeset();
    DB::connection()->enableQueryLog();
    $this->get('/moderation?view='.$view)->assertOk()
        ->assertInertia(fn (Assert $page) => $page->missing('records.total')->where('counts.nodes', null));
    $queries = collect(DB::connection()->getQueryLog())->pluck('query')->implode("\n");
    expect($queries)->not->toMatch('/\b(count|max|min|sum|avg)\s*\(/i');
    DB::connection()->disableQueryLog();
})->with(['nodes', 'changesets']);

test('moderation no longer exposes rule options or automatically flags large changesets', function () {
    $this->moderator();
    $this->sourceChangeset(100, ['alpr_nodes_created' => 20, 'alpr_nodes_deleted' => 5]);
    $this->get('/moderation?view=changesets')->assertInertia(fn (Assert $page) => $page
        ->where('view', 'changesets')->missing('ruleOptions')
        ->where('records.data.0.status', 'Needs review'));
});

test('editor profiles include twelve calendar weeks and preserve manual flagged timelines', function () {
    $this->travelTo(now()->setDate(2026, 9, 7)->setTime(12, 0)->utc());
    $this->moderator();
    $this->sourceChangeset(100, ['created_at' => now()->subWeeks(11)]);
    $this->sourceChangeset(101);
    $this->sourceChangeset(102, ['created_at' => now()->subWeeks(12)]);
    $row = app(ModerationReader::class)->changesets()->where('source.id', 101)->first();
    $this->patch('/moderation/changesets/101/review', ['revision' => $row->revision, 'status' => 'Flagged'])->assertRedirect();
    $this->get('/moderation?view=profile&uid=123')->assertInertia(fn (Assert $page) => $page
        ->where('profile.tracked_changesets', 3)->where('profile.status', null)->where('profile.flags_count', null)
        ->has('weeks', 12)->where('weeks.0.total', 1)->where('weeks.1.total', 0)->where('weeks.11.total', 1));
    $this->get('/moderation?view=profile&uid=123&statuses[]=Flagged')->assertInertia(fn (Assert $page) => $page
        ->has('records.data', 1)->where('records.data.0.id', 101)->where('profile.flagged_changesets', 1));
});
