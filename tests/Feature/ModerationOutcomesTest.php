<?php

use App\Models\ModerationContribution;
use App\Models\ModerationOutcome;
use App\Services\OpenStreetMap\ModerationOutcomeProcessor;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);
beforeEach(function (): void {
    $this->createModerationSource();
});

test('only authored tags and deletions create other editor revert events', function (array $tags, bool $visible, string $status, int $events) {
    $this->sourceNode(200, 1, ['tags' => json_encode(['operator' => 'City']), 'osm_updated_at' => now()->subDays(2)]);
    $this->sourceNode(200, 2, ['changeset_id' => 101, 'osm_uid' => 456, 'osm_user' => 'other', 'tags' => json_encode($tags), 'visible' => $visible, 'latitude' => 31]);
    app(ModerationOutcomeProcessor::class)->process(200);
    expect(ModerationContribution::where('changeset_id', 100)->first()->status)->toBe($status)
        ->and(ModerationOutcome::where('self_edit', false)->count())->toBe($events);
    if (! $visible) {
        expect(ModerationOutcome::first()->evidence['tags']['operator'])->toEqual(['before' => 'City', 'after' => null]);
    }
    if ($events) {
        expect(ModerationOutcome::first()->elapsed_seconds)->toBeGreaterThan(0);
    }
})->with([
    'changed' => [['operator' => 'Flock'], true, 'reverted', 1],
    'removed' => [[], true, 'reverted', 1],
    'deleted' => [[], false, 'reverted', 1],
    'unrelated tag' => [['operator' => 'City', 'direction' => '90'], true, 'edited', 0],
    'position alone' => [['operator' => 'City'], true, 'edited', 0],
]);

test('unchanged tags retain their author and restorations preserve historical reverts', function () {
    foreach ([['operator' => 'A'], ['operator' => 'A', 'direction' => '90'], ['operator' => 'B', 'direction' => '90'], ['operator' => 'A', 'direction' => '90']] as $index => $tags) {
        $this->sourceNode(200, $index + 1, ['changeset_id' => 100 + $index, 'osm_uid' => 10 + $index, 'tags' => json_encode($tags)]);
    }
    $processor = app(ModerationOutcomeProcessor::class);
    $processor->process(200);
    $processor->process(200);
    expect(ModerationOutcome::count())->toBe(2)
        ->and(ModerationContribution::where('changeset_id', 100)->value('status'))->toBe('reverted')
        ->and(ModerationContribution::where('changeset_id', 101)->value('status'))->toBe('edited');
    expect(ModerationOutcome::first()->evidence['tags']['operator'])->toEqual(['before' => 'A', 'after' => 'B']);
});

test('self edits are separate and subsequent changes follow the new ownership', function () {
    foreach (['A', 'B', 'C'] as $index => $value) {
        $this->sourceNode(200, $index + 1, ['changeset_id' => 100 + $index, 'osm_uid' => $index < 2 ? 123 : 456, 'tags' => json_encode(['operator' => $value])]);
    }
    app(ModerationOutcomeProcessor::class)->process(200);
    expect(ModerationOutcome::where('self_edit', true)->count())->toBe(1)
        ->and(ModerationOutcome::where('self_edit', false)->count())->toBe(1)
        ->and(ModerationContribution::where('changeset_id', 100)->value('status'))->not->toBe('reverted')
        ->and(ModerationContribution::where('changeset_id', 101)->value('status'))->toBe('reverted');
});

test('only the final contribution within each changeset is compared', function () {
    $this->sourceNode(200, 1, ['tags' => json_encode(['operator' => 'A'])]);
    $this->sourceNode(200, 2, ['tags' => json_encode(['operator' => 'B'])]);
    $this->sourceNode(200, 3, ['changeset_id' => 101, 'osm_uid' => 456, 'tags' => json_encode(['operator' => 'B'])]);
    app(ModerationOutcomeProcessor::class)->process(200);
    expect(ModerationContribution::count())->toBe(2)->and(ModerationOutcome::count())->toBe(0)
        ->and(ModerationContribution::first()->node_version)->toBe(2);
});

test('late histories replace unknown classification without duplicating events', function () {
    $this->sourceNode(200, 2, ['changeset_id' => 101, 'osm_uid' => 456, 'tags' => json_encode(['operator' => 'B'])]);
    $processor = app(ModerationOutcomeProcessor::class);
    $processor->process(200);
    expect(ModerationContribution::first()->status)->toBe('unknown');
    $this->sourceNode(200, 1, ['tags' => json_encode(['operator' => 'A'])]);
    $processor->process(200);
    $processor->process(200);
    expect(ModerationContribution::where('status', 'unknown')->count())->toBe(0)->and(ModerationOutcome::count())->toBe(1);
});
