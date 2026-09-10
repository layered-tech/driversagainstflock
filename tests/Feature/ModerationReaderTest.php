<?php

use App\Models\ModerationReview;
use App\Models\OsmChangeset;
use App\Models\OsmChangesetComment;
use App\Models\OsmNodeVersion;
use App\Models\WatchedArea;
use App\Services\OpenStreetMap\ModerationReader;
use Illuminate\Support\Facades\DB;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);
beforeEach(function (): void {
    $this->createModerationSource();
});
test('OSM models use the configured reader connection and published tables', function () {
    config(['osm.reader.connection' => 'source-reader']);
    foreach ([new OsmChangeset, new OsmChangesetComment, new OsmNodeVersion] as $model) {
        expect($model->getConnectionName())->toBe('source-reader');
    }
    expect((new OsmChangeset)->getTable())->toBe('testing_changesets');
});
test('changesets read live source data and apply current revision reviews before pagination', function () {
    $this->sourceChangeset();
    $reader = app(ModerationReader::class);
    $row = $reader->changesets()->first();
    expect($row->osm_changeset_id)->toBe(100)->and($row->added)->toBe(2)->and($row->status)->toBe('Needs review');
    ModerationReview::factory()->create(['subject_type' => 'changeset', 'subject_id' => 100, 'revision' => $row->revision, 'status' => 'Reviewed']);
    expect($reader->listing('changesets', ['statuses' => ['Reviewed']])->count())->toBe(1);
    DB::table('testing_changesets')->where('osm_changeset_id', 100)->update(['alpr_nodes_created' => 3]);
    expect($reader->listing('changesets', ['statuses' => ['Reviewed']])->count())->toBe(0)
        ->and($reader->changesets()->first()->added)->toBe(3);
});
test('latest nodes have no inferred rules and old dismissals do not hide them', function () {
    $this->sourceNode();
    $reader = app(ModerationReader::class);
    $row = $reader->listing('nodes', [])->first();
    expect((array) $row)->not->toHaveKeys(['rules', 'severity'])->and($row->status)->toBe('Needs review');
    ModerationReview::factory()->create(['subject_type' => 'node', 'subject_id' => 200, 'revision' => $row->revision, 'status' => 'Dismissed']);
    expect($reader->listing('nodes', [])->count())->toBe(1);
    $this->sourceNode(200, 2);
    expect($reader->listing('nodes', [])->first()->osm_version)->toBe(2);
});
test('direction ranges wrap north and support zero degrees', function () {
    $this->sourceNode(201, 1, ['tags' => json_encode(['direction' => '350'])]);
    $this->sourceNode(202, 1, ['tags' => json_encode(['direction' => '0'])]);
    $this->sourceNode(203, 1, ['tags' => json_encode(['direction' => '90'])]);
    $reader = app(ModerationReader::class);
    expect($reader->listing('nodes', ['direction_from' => 340, 'direction_to' => 10])->count())->toBe(2)
        ->and($reader->listing('nodes', ['direction_from' => 0, 'direction_to' => 0])->first()->id)->toBe(202);
});
test('nodes can be filtered by exact OSM ID', function () {
    $this->sourceNode(200);
    $this->sourceNode(201);

    $nodes = app(ModerationReader::class)->listing('nodes', ['osm_id' => 201])->get();

    expect($nodes)->toHaveCount(1)
        ->and($nodes->first()->id)->toBe(201);
});
test('movement and operator changes use the previous actual node version', function () {
    $this->sourceNode(200, 1, ['tags' => json_encode(['operator' => 'City'])]);
    $this->sourceNode(200, 2, ['latitude' => 31, 'geom' => DB::raw('ST_SetSRID(ST_MakePoint(-97.5,31),4326)'), 'tags' => json_encode(['operator' => 'Flock Safety', 'camera:direction' => 'E', 'camera:type' => 'fixed'])]);
    $node = app(ModerationReader::class)->listing('nodes', [])->first();
    expect((array) $node)->not->toHaveKeys(['rules', 'severity'])->and($node->direction)->toBe(90)->and(json_decode($node->previous, true)['tags']['operator'])->toBe('City');
});
test('editor aggregation includes live changesets without fabricated flag counts', function () {
    $this->sourceChangeset();
    $this->sourceNode();
    $editor = app(ModerationReader::class)->listing('editors', [])->first();
    expect($editor->osm_uid)->toBe(123)->and($editor->tracked_changesets)->toBe(1)->and($editor->flags_count)->toBeNull()->and($editor->status)->toBeNull();
});

test('large changesets do not infer flags or editor statuses', function () {
    foreach (range(100, 107) as $id) {
        $this->sourceChangeset($id, ['alpr_nodes_created' => 12, 'alpr_nodes_deleted' => 3]);
    }
    $reader = app(ModerationReader::class);
    expect($reader->listing('changesets', ['statuses' => ['Flagged']])->count())->toBe(0);
    expect($reader->listing('editors', [])->first()->status)->toBeNull();
    expect($reader->listing('editors', ['user' => '123'])->orderByDesc('added')->first()->added)->toBe(96);
});

test('changeset details include actual versions and only visible discussion comments', function () {
    $this->sourceChangeset();
    $this->sourceNode();
    foreach ([true, false] as $ordinal => $visible) {
        DB::table('testing_changeset_comments')->insert(['osm_changeset_id' => 100, 'ordinal' => $ordinal, 'visible' => $visible, 'body' => $visible ? 'Survey evidence' : 'Hidden discussion', 'commented_at' => now()]);
    }
    $details = app(ModerationReader::class)->changesetDetail(100);
    expect($details['versions']->total())->toBe(1)->and($details['comments']->total())->toBe(1)->and($details['comments']->items()[0]->body)->toBe('Survey evidence');
});

test('deleted node versions retain their last known map location', function () {
    $this->sourceChangeset(101);
    $this->sourceNode(200);
    $this->sourceNode(200, 2, [
        'changeset_id' => 101,
        'visible' => false,
        'latitude' => null,
        'longitude' => null,
        'geom' => null,
        'tags' => json_encode([]),
    ]);

    $deletedNode = app(ModerationReader::class)->changesetDetail(101)['versions']->items()[0];

    expect($deletedNode->visible)->toBeFalse()
        ->and($deletedNode->latitude)->toBe(30.5)
        ->and($deletedNode->longitude)->toBe(-97.5)
        ->and($deletedNode->location_is_historical)->toBeTrue();
});

test('missing direction is a tag filter without requiring a moderation rule', function () {
    $this->sourceNode(200);
    $this->sourceNode(201, 1, ['tags' => json_encode(['direction' => '0'])]);
    $this->sourceNode(202, 1, ['tags' => json_encode(['direction' => 'invalid'])]);
    $reader = app(ModerationReader::class);
    expect($reader->listing('nodes', [])->count())->toBe(3)
        ->and($reader->listing('nodes', ['missing_direction' => true])->pluck('id')->all())->toBe([200]);
});

test('paged listings preserve ordering, current reviews, details and next page detection', function (string $view) {
    $reader = app(ModerationReader::class);
    foreach (range(200, 204) as $id) {
        $this->sourceChangeset($id);
        $this->sourceNode($id, 1, ['tags' => json_encode(['operator' => 'Before'])]);
        $this->sourceNode($id, 2, ['tags' => json_encode(['operator' => 'After'])]);
    }
    $row = $reader->listing($view, [])->where('id', 203)->first();
    ModerationReview::factory()->create([
        'subject_type' => $view === 'nodes' ? 'node' : 'changeset',
        'subject_id' => 203, 'revision' => $row->revision, 'status' => 'Reviewed',
    ]);

    foreach ([1 => [204, 203], 2 => [202, 201], 3 => [200], 4 => []] as $number => $ids) {
        $query = $reader->listing($view, [], forPagination: true)->orderByDesc('changed_at')->orderByDesc('id');
        $page = $reader->paginateListing($query, $view, 2, $number);
        $expected = $reader->listing($view, [])->orderByDesc('changed_at')->orderByDesc('id')->forPage($number, 2)->get();

        expect($page->getCollection()->pluck('id')->all())->toBe($ids)
            ->and($page->getCollection()->toArray())->toEqual($expected->toArray())
            ->and($page->hasMorePages())->toBe($number < 3);
    }
})->with(['nodes', 'changesets']);

test('paged listings filter and sort current review status before selecting a page', function (string $view) {
    $reader = app(ModerationReader::class);
    foreach (range(200, 205) as $id) {
        $this->sourceNode($id);
        $this->sourceChangeset($id);
        $row = $reader->listing($view, [])->where('id', $id)->first();
        ModerationReview::factory()->create([
            'subject_type' => $view === 'nodes' ? 'node' : 'changeset',
            'subject_id' => $id, 'revision' => $row->revision,
            'status' => $id % 2 === 0 ? 'Reviewed' : 'Dismissed',
        ]);
    }
    $this->sourceNode(204, 2);
    DB::table('testing_changesets')->where('osm_changeset_id', 204)->update(['alpr_nodes_created' => 3]);
    $filters = ['statuses' => ['Reviewed']];
    $query = $reader->listing($view, $filters, forPagination: true)->orderByDesc('id');
    $page = $reader->paginateListing($query, $view, 1);

    expect($page->items()[0]->id)->toBe(202)->and($page->hasMorePages())->toBeTrue();

    $filters = ['sort' => 'status'];
    $query = $reader->listing($view, $filters, forPagination: true)->orderBy('status')->orderByDesc('id');
    $page = $reader->paginateListing($query, $view, 2);
    expect($page->getCollection()->pluck('id')->all())->toBe([205, 203]);
})->with(['nodes', 'changesets']);

test('paged node filters use the latest version and retain deleted locations within an area', function () {
    $area = WatchedArea::factory()->create();
    $this->sourceNode(200, 1, ['tags' => json_encode(['operator' => 'Flock'])]);
    $this->sourceNode(200, 2, ['tags' => json_encode(['operator' => 'Other'])]);
    $this->sourceNode(201, 1, ['tags' => json_encode(['operator' => 'Flock'])]);
    $this->sourceNode(202);
    $this->sourceNode(202, 2, ['visible' => false, 'latitude' => null, 'longitude' => null, 'geom' => null]);
    $reader = app(ModerationReader::class);
    $query = $reader->listing('nodes', ['operator' => 'Flock'], forPagination: true)->orderByDesc('id');
    expect($reader->paginateListing($query, 'nodes', 1)->items()[0]->id)->toBe(201);

    $query = $reader->listing('nodes', ['area' => $area->id], forPagination: true)->orderByDesc('id');
    $page = $reader->paginateListing($query, 'nodes', 1);
    expect($page->items()[0]->id)->toBe(202)
        ->and($page->items()[0]->latitude)->toBe(30.5)
        ->and($page->items()[0]->location_is_historical)->toBeTrue();
});

test('node pagination bounds previous-version lookups to the requested page', function () {
    foreach (range(200, 239) as $id) {
        $this->sourceNode($id);
        $this->sourceNode($id, 2);
        ModerationReview::factory()->create(['subject_type' => 'node', 'subject_id' => $id, 'revision' => 'stale']);
    }
    $reader = app(ModerationReader::class);
    $connection = $reader->query()->getConnection();
    $connection->enableQueryLog();
    try {
        $query = $reader->listing('nodes', [], forPagination: true)->orderByDesc('changed_at')->orderByDesc('id');
        $reader->paginateListing($query, 'nodes', 2);
        $executed = collect($connection->getQueryLog())->last();
    } finally {
        $connection->disableQueryLog();
        $connection->flushQueryLog();
    }
    $plan = json_decode($connection->select('EXPLAIN (ANALYZE, FORMAT JSON) '.$executed['query'], $executed['bindings'])[0]->{'QUERY PLAN'}, true);
    $nodes = collect();
    $visit = function (array $node) use (&$visit, $nodes): void {
        $nodes->push($node);
        foreach ($node['Plans'] ?? [] as $child) {
            $visit($child);
        }
    };
    $visit($plan[0]['Plan']);
    $historyScans = $nodes->filter(fn (array $node): bool => ($node['Relation Name'] ?? null) === 'testing_node_versions');

    expect($historyScans)->not->toBeEmpty()
        ->and($historyScans->max('Actual Loops'))->toBeLessThanOrEqual(3)
        ->and($nodes->where('Function Name', 'jsonb_to_recordset')->max('Actual Loops'))->toBe(1);
});
