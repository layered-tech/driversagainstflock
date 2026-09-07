<?php

use App\Models\ModerationReview;
use App\Models\OsmChangeset;
use App\Models\OsmChangesetComment;
use App\Models\OsmNodeVersion;
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

test('missing direction is a tag filter without requiring a moderation rule', function () {
    $this->sourceNode(200);
    $this->sourceNode(201, 1, ['tags' => json_encode(['direction' => '0'])]);
    $this->sourceNode(202, 1, ['tags' => json_encode(['direction' => 'invalid'])]);
    $reader = app(ModerationReader::class);
    expect($reader->listing('nodes', [])->count())->toBe(3)
        ->and($reader->listing('nodes', ['missing_direction' => true])->pluck('id')->all())->toBe([200]);
});
