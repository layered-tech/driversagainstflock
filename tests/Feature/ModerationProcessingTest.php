<?php

use App\Jobs\DrainModerationSummaries;
use App\Jobs\ProcessModeration;
use App\Models\ModerationContribution;
use App\Models\ModerationEditorArea;
use App\Models\ModerationEditorSummary;
use App\Models\ModerationEvaluation;
use App\Models\ModerationFlag;
use App\Models\ModerationProcess;
use App\Models\ModerationRule;
use App\Models\OsmEditorProfile;
use App\Models\WatchedArea;
use App\Services\OpenStreetMap\ModerationOutcomeProcessor;
use App\Services\OpenStreetMap\ModerationProcessing;
use App\Services\OpenStreetMap\ModerationProfileRefresh;
use App\Services\OpenStreetMap\ModerationSummaries;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);

beforeEach(function (): void {
    $this->createModerationSource();
    Cache::flush();
});

test('removed reconcile mode is rejected', function () {
    $this->artisan('moderation:process reconcile')->assertFailed();
});

test('outcome commands fan out independent node jobs without cursors', function () {
    Queue::fake();
    $this->sourceNode(200);
    $this->sourceNode(201);

    $this->artisan('moderation:process outcomes --rebuild')
        ->expectsOutputToContain('Queued 2 independent moderation jobs')
        ->assertSuccessful();

    Queue::assertPushedOn('moderation', ProcessModeration::class);
    Queue::assertPushedTimes(ProcessModeration::class, 2);
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->kind === 'outcome' && $job->target === 200);
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->kind === 'outcome' && $job->target === 201);
    expect(ModerationProcess::where('name', 'outcomes')->first())
        ->state->toBe('queued')
        ->total_jobs->toBe(2)
        ->pending_jobs->toBe(2)
        ->failed_jobs->toBe(0)
        ->and(Schema::hasColumn('moderation_processes', 'cursor'))->toBeFalse();
});

test('regular outcome commands queue missing and incomplete node results', function () {
    $this->sourceNode(200, 2, ['changeset_id' => 101]);
    app(ModerationOutcomeProcessor::class)->process(200);
    expect(ModerationContribution::where('node_id', 200)->value('history_complete'))->toBeFalse();
    $this->sourceNode(200);
    $this->sourceNode(201);
    Queue::fake();

    $this->artisan('moderation:process outcomes')->assertSuccessful();

    Queue::assertPushedTimes(ProcessModeration::class, 2);
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->target === 200);
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->target === 201);
});

test('independent jobs finish process counts without dispatching continuations', function () {
    Queue::fake();
    $this->sourceNode(200);
    $this->artisan('moderation:process outcomes --node=200')->assertSuccessful();
    $job = Queue::pushed(ProcessModeration::class)->sole();

    $job->handle(app(ModerationProcessing::class));

    expect(ModerationContribution::where('node_id', 200)->exists())->toBeTrue()
        ->and(ModerationProcess::where('name', 'outcomes:node:200')->first())
        ->state->toBe('complete')
        ->pending_jobs->toBe(0)
        ->failed_jobs->toBe(0)
        ->last_success_at->not->toBeNull();
    Queue::assertPushedTimes(ProcessModeration::class, 1);
});

test('failed independent jobs are counted after their retries are exhausted', function () {
    $process = ModerationProcess::create([
        'name' => 'outcomes',
        'state' => 'running',
        'run_number' => 3,
        'total_jobs' => 1,
        'pending_jobs' => 1,
    ]);
    $job = new ProcessModeration('outcome', 200, processId: $process->id, runNumber: 3);

    $job->failed(new RuntimeException('Node processing failed'));

    expect($process->fresh())
        ->state->toBe('failed')
        ->pending_jobs->toBe(0)
        ->failed_jobs->toBe(1)
        ->last_error->toBe('Node processing failed');
});

test('legacy queued jobs are safely retired after the job payload changes', function () {
    $job = new ProcessModeration('outcomes');
    unset($job->target, $job->ruleId, $job->ruleVersion, $job->processId, $job->runNumber);

    $legacyJob = unserialize(serialize($job));
    $processing = $this->mock(ModerationProcessing::class);
    $processing->shouldNotReceive('process');

    expect($legacyJob->middleware())->toHaveCount(1);
    $legacyJob->handle($processing);
    $legacyJob->failed(new RuntimeException('Legacy payload'));
});

test('legacy queued jobs retain their process counters when identifiers are available', function () {
    $process = ModerationProcess::create([
        'name' => 'profiles',
        'state' => 'running',
        'run_number' => 2,
        'total_jobs' => 1,
        'pending_jobs' => 1,
    ]);
    $job = new ProcessModeration('profile', 123, processId: $process->id, runNumber: 2);
    unset($job->target);

    unserialize(serialize($job))->handle(app(ModerationProcessing::class));

    expect($process->fresh())
        ->state->toBe('complete')
        ->pending_jobs->toBe(0);
});

test('commands do not enqueue a second run while the first command is still dispatching', function () {
    Queue::fake();
    ModerationProcess::create([
        'name' => 'outcomes',
        'state' => 'dispatching',
        'run_number' => 1,
        'total_jobs' => 0,
        'pending_jobs' => 0,
    ]);
    $this->sourceNode(200);

    $this->artisan('moderation:process outcomes --rebuild')
        ->expectsOutputToContain('Already running: outcomes')
        ->assertSuccessful();

    Queue::assertNothingPushed();
});

test('queued jobs cannot clear a dispatch failure after finishing', function () {
    $process = ModerationProcess::create([
        'name' => 'outcomes',
        'state' => 'failed',
        'run_number' => 2,
        'total_jobs' => 1,
        'pending_jobs' => 1,
        'last_error' => 'Dispatch failed: Redis unavailable',
    ]);

    app(ModerationProcessing::class)->markJobComplete($process->id, 2);

    expect($process->fresh())
        ->state->toBe('failed')
        ->pending_jobs->toBe(0)
        ->last_error->toBe('Dispatch failed: Redis unavailable')
        ->last_success_at->toBeNull();
});

test('rules fan out one independent job per rule and node', function () {
    Queue::fake();
    WatchedArea::factory()->create();
    $rule = ModerationRule::factory()->create([
        'name' => 'Operator',
        'type' => 'missing_tags',
        'severity' => 'Medium',
        'enabled' => true,
        'version' => 1,
        'settings' => ['keys' => ['operator']],
        'conditions' => [],
        'exceptions' => [],
        'area_ids' => [],
    ]);
    $this->sourceNode(200);
    $this->sourceNode(201);

    $this->artisan('moderation:process rules')->assertSuccessful();

    Queue::assertPushedTimes(ProcessModeration::class, 2);
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->kind === 'rule'
        && $job->ruleId === $rule->id
        && $job->ruleVersion === 1
        && $job->target === 200);
    $job = Queue::pushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->target === 200)->sole();
    $job->handle(app(ModerationProcessing::class));
    expect(ModerationFlag::active()->count())->toBe(1)
        ->and(ModerationProcess::where('name', 'rule:'.$rule->id.':1')->first())
        ->state->toBe('running')
        ->pending_jobs->toBe(1);
});

test('profile jobs retry their own editor without holding a dataset cursor', function () {
    Queue::fake();
    $this->sourceChangeset();
    Http::fake(['*' => Http::sequence()
        ->push([], 503)
        ->push(['user' => [
            'id' => 123,
            'display_name' => 'Current mapper',
            'account_created' => '2015-01-01T00:00:00Z',
            'img' => ['href' => 'https://example.com/avatar.png'],
            'changesets' => ['count' => 500],
        ]])]);
    $this->artisan('moderation:process profiles')->assertSuccessful();
    $job = Queue::pushed(ProcessModeration::class)->sole();

    expect(fn () => $job->handle(app(ModerationProcessing::class)))->toThrow(RequestException::class);
    expect(ModerationProcess::where('name', 'profiles')->value('pending_jobs'))->toBe(1);
    $job->handle(app(ModerationProcessing::class));

    expect(OsmEditorProfile::first())
        ->display_name->toBe('Current mapper')
        ->changesets_count->toBe(500)
        ->and(ModerationProcess::where('name', 'profiles')->first())
        ->state->toBe('complete')
        ->pending_jobs->toBe(0);
});

test('optional cache warming dispatches small independent jobs', function () {
    Queue::fake();
    $this->sourceChangeset();
    $area = WatchedArea::factory()->create();

    $this->artisan('moderation:process warm')->assertSuccessful();

    Queue::assertNotPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->kind === 'warm-editors');
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->kind === 'warm-editor' && $job->target === 123);
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->kind === 'warm-area' && $job->target === $area->id);
    expect(ModerationProcess::where('name', 'warm')->first())
        ->total_jobs->toBe(2)
        ->pending_jobs->toBe(2);
});

test('summary commands queue only missing or dirty editors unless rebuilding', function () {
    Queue::fake();
    $this->sourceChangeset(100, ['osm_uid' => 123]);
    $this->sourceChangeset(101, ['osm_uid' => 456]);
    ModerationEditorSummary::create(['osm_uid' => 123, 'calculated_at' => now()]);

    $this->artisan('moderation:process summaries')->assertSuccessful();

    Queue::assertPushedTimes(ProcessModeration::class, 1);
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->kind === 'summary-editor' && $job->target === 456);
    expect(ModerationEditorSummary::where('osm_uid', 456)->first())->dirty_at->not->toBeNull();
});

test('full summary passes consume dirty rows even when their source changeset is no longer eligible', function () {
    Queue::fake();
    $this->sourceChangeset(attributes: ['alpr_nodes_touched' => 0]);
    ModerationEditorSummary::create(['osm_uid' => 123, 'dirty_at' => now()]);

    $this->artisan('moderation:process summaries')->assertSuccessful();

    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->kind === 'summary-editor' && $job->target === 123);
    Queue::pushed(ProcessModeration::class)->sole()->handle(app(ModerationProcessing::class));
    expect(ModerationEditorSummary::where('osm_uid', 123)->exists())->toBeFalse();
});

test('completed summary invalidators request a final summary drain', function () {
    Queue::fake();
    ModerationEditorSummary::create(['osm_uid' => 123, 'dirty_at' => now()]);
    $process = ModerationProcess::create([
        'name' => 'outcomes',
        'state' => 'running',
        'run_number' => 1,
        'total_jobs' => 1,
        'pending_jobs' => 1,
    ]);

    app(ModerationProcessing::class)->markJobComplete($process->id, $process->run_number);

    Queue::assertPushedOn('moderation', DrainModerationSummaries::class);
});

test('scoped processing does not start an unrelated summary drain', function () {
    Queue::fake();
    ModerationEditorSummary::create(['osm_uid' => 123, 'dirty_at' => now()]);
    $process = ModerationProcess::create([
        'name' => 'outcomes:node:200',
        'state' => 'running',
        'run_number' => 1,
        'total_jobs' => 1,
        'pending_jobs' => 1,
    ]);

    app(ModerationProcessing::class)->markJobComplete($process->id, $process->run_number);

    Queue::assertNotPushed(DrainModerationSummaries::class);
});

test('summary drains wait for upstream processing to settle', function () {
    ModerationEditorSummary::create(['osm_uid' => 123, 'dirty_at' => now()]);
    ModerationProcess::create([
        'name' => 'profiles',
        'state' => 'running',
        'run_number' => 1,
        'total_jobs' => 1,
        'pending_jobs' => 1,
    ]);
    $job = (new DrainModerationSummaries)->withFakeQueueInteractions();

    $job->handle(app(ModerationProcessing::class));

    $job->assertReleased(delay: 60);
    expect(ModerationProcess::count())->toBe(1);
});

test('summary drains queue the existing summary processor after upstream work settles', function () {
    Queue::fake();
    $this->sourceChangeset();
    ModerationEditorSummary::create(['osm_uid' => 123, 'dirty_at' => now()]);
    ModerationProcess::create([
        'name' => 'outcomes:node:200',
        'state' => 'running',
        'run_number' => 1,
        'total_jobs' => 1,
        'pending_jobs' => 1,
    ]);
    $job = (new DrainModerationSummaries)->withFakeQueueInteractions();

    $job->handle(app(ModerationProcessing::class));

    $job->assertNotReleased();
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $queued): bool => $queued->kind === 'summary-editor' && $queued->target === 123);
    expect(ModerationProcess::where('name', 'summaries')->sole())
        ->state->toBe('queued')
        ->pending_jobs->toBe(1);
});

test('completed full summary passes drain invalidations left during the pass', function () {
    Queue::fake();
    ModerationEditorSummary::create(['osm_uid' => 123, 'dirty_at' => now()]);
    $process = ModerationProcess::create([
        'name' => 'summaries',
        'state' => 'running',
        'run_number' => 1,
        'total_jobs' => 1,
        'pending_jobs' => 1,
    ]);

    app(ModerationProcessing::class)->markJobComplete($process->id, $process->run_number);

    Queue::assertPushedOn('moderation', DrainModerationSummaries::class);
});

test('summary rebuild queues every editor and stamps its generation', function () {
    Queue::fake();
    $this->sourceChangeset(100, ['osm_uid' => 123]);
    $this->sourceChangeset(101, ['osm_uid' => 456]);
    ModerationEditorSummary::create(['osm_uid' => 123, 'calculated_at' => now()]);

    $this->artisan('moderation:process summaries --rebuild')->assertSuccessful();

    Queue::assertPushedTimes(ProcessModeration::class, 2);
    expect(ModerationEditorSummary::pluck('rebuild_run', 'osm_uid')->all())->toBe([123 => 1, 456 => 1]);
});

test('a completed summary rebuild removes editors no longer in the source data', function () {
    Queue::fake();
    $this->sourceChangeset(100, ['osm_uid' => 123]);
    ModerationEditorSummary::create(['osm_uid' => 999, 'calculated_at' => now(), 'rebuild_run' => 1]);
    ModerationProcess::create(['name' => 'summaries:rebuild', 'state' => 'complete', 'run_number' => 1]);

    $this->artisan('moderation:process summaries --rebuild')->assertSuccessful();
    $job = Queue::pushed(ProcessModeration::class)->sole();
    $job->handle(app(ModerationProcessing::class));

    expect(ModerationEditorSummary::pluck('osm_uid')->all())->toBe([123])
        ->and(ModerationProcess::where('name', 'summaries:rebuild')->firstOrFail()->state)->toBe('complete');
});

test('user outcome commands validate scope and queue each matching node', function () {
    Queue::fake();
    $this->sourceNode(200);
    $this->sourceNode(201);
    $this->sourceNode(202, 1, ['osm_uid' => 456]);

    $this->artisan('moderation:process outcomes --user=123')->assertSuccessful();
    foreach (['outcomes --user=0', 'outcomes --user=abc', 'outcomes --user=-1', 'outcomes --user=123 --node=200', 'profiles --user=123', 'status --user=123'] as $arguments) {
        $this->artisan('moderation:process '.$arguments)->assertFailed();
    }

    Queue::assertPushedTimes(ProcessModeration::class, 2);
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->target === 200);
    Queue::assertPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->target === 201);
    expect(ModerationProcess::where('name', 'outcomes:user:123')->first())
        ->state->toBe('queued')
        ->total_jobs->toBe(2);
});

test('profile refreshes retain known metadata after a later api failure', function () {
    Http::fake(['*' => Http::sequence()
        ->push(['user' => [
            'id' => 123,
            'display_name' => 'Current mapper',
            'account_created' => '2015-01-01T00:00:00Z',
            'img' => ['href' => 'https://example.com/avatar.png'],
            'changesets' => ['count' => 500],
        ]])
        ->push([], 404)]);

    app(ModerationProfileRefresh::class)->refresh(123);
    app(ModerationProfileRefresh::class)->refresh(123);

    expect(OsmEditorProfile::first())
        ->changesets_count->toBe(500)
        ->last_error->not->toBeNull();
});

test('node locks prevent overlapping processors from writing outcomes', function () {
    $this->sourceNode(200);
    $lock = Cache::lock('moderation:outcome-node:200', 120);
    expect($lock->get())->toBeTrue();
    try {
        expect(fn () => app(ModerationOutcomeProcessor::class)->process(200))
            ->toThrow(LockTimeoutException::class);
        expect(ModerationContribution::count())->toBe(0);
    } finally {
        $lock->release();
    }
    app(ModerationOutcomeProcessor::class)->process(200);
    expect(ModerationContribution::count())->toBe(1);
});

test('limited outcomes count eligible distinct nodes across dispatch chunks', function () {
    config(['moderation.processing.dispatch_chunk_size' => 2]);
    foreach ([200, 201, 202, 203, 204, 205] as $node) {
        $this->sourceNode($node);
    }
    $this->sourceNode(202, 2);
    app(ModerationOutcomeProcessor::class)->process(200);
    app(ModerationOutcomeProcessor::class)->process(201);
    Queue::fake();

    $this->artisan('moderation:process outcomes --limit=3')->assertSuccessful();

    expect(Queue::pushed(ProcessModeration::class)->pluck('target')->all())->toBe([202, 203, 204])
        ->and(ModerationProcess::sole())->name->toBe('outcomes:limit:3')->total_jobs->toBe(3);
});

test('limited outcome rebuilds and explicit users reprocess current nodes', function (string $options) {
    config(['moderation.processing.dispatch_chunk_size' => 1]);
    $this->sourceNode(199, 1, ['osm_uid' => 456]);
    $this->sourceNode(200);
    $this->sourceNode(201);
    app(ModerationOutcomeProcessor::class)->process(200);
    Queue::fake();

    $this->artisan('moderation:process outcomes '.$options)->assertSuccessful();

    expect(Queue::pushed(ProcessModeration::class)->pluck('target')->all())->toBe(
        str_contains($options, '--user') ? [200] : [199, 200],
    );
})->with(['--user=123 --limit=1', '--rebuild --limit=2']);

test('limited summaries skip clean editors and stop without creating unrelated placeholders', function () {
    config(['moderation.processing.dispatch_chunk_size' => 2]);
    foreach ([10, 20, 30, 40, 50, 60] as $uid) {
        $this->sourceChangeset($uid, ['osm_uid' => $uid]);
    }
    $this->sourceChangeset(100, ['osm_uid' => 30]);
    foreach ([10, 20] as $uid) {
        ModerationEditorSummary::create(['osm_uid' => $uid, 'calculated_at' => now()]);
    }
    ModerationEditorSummary::create(['osm_uid' => 40, 'dirty_at' => now()]);
    WatchedArea::factory()->create(['summary_dirty_at' => now()]);
    Queue::fake();

    $this->artisan('moderation:process summaries --limit=3')->assertSuccessful();

    expect(Queue::pushed(ProcessModeration::class)->pluck('target')->all())->toBe([30, 40, 50])
        ->and(ModerationEditorSummary::where('osm_uid', 60)->exists())->toBeFalse();
    Queue::assertNotPushed(ProcessModeration::class, fn (ProcessModeration $job): bool => $job->kind === 'summary-area');
});

test('a specific clean editor summary refreshes immediately without queue work', function () {
    $this->sourceChangeset();
    $this->sourceChangeset(101, ['osm_uid' => 456]);
    $summary = ModerationEditorSummary::create(['osm_uid' => 123, 'name' => 'Old name', 'calculated_at' => now()->subDay(), 'rebuild_run' => 9]);
    Queue::fake();

    $this->artisan('moderation:process summaries --user=123 --sync')
        ->expectsOutputToContain('Processing summary-editor 123')
        ->expectsOutputToContain('Completed 1 jobs; failed 0 jobs')
        ->assertSuccessful();

    expect($summary->fresh())->name->toBe('mapper')->rebuild_run->toBe(9)->dirty_at->toBeNull()
        ->and(ModerationEditorSummary::count())->toBe(1)
        ->and(ModerationProcess::sole())->name->toBe('summaries:user:123')->state->toBe('complete')->pending_jobs->toBe(0);
    Queue::assertNothingPushed();
});

test('limited summary rebuilds preserve generations unrelated editors and area memberships', function () {
    $this->sourceChangeset();
    $this->sourceChangeset(101, ['osm_uid' => 456]);
    $selected = ModerationEditorSummary::create(['osm_uid' => 123, 'rebuild_run' => 7]);
    $unselected = ModerationEditorSummary::create(['osm_uid' => 456, 'rebuild_run' => 7]);
    $removed = ModerationEditorSummary::create(['osm_uid' => 999, 'rebuild_run' => 6]);
    $area = WatchedArea::factory()->create(['summary_dirty_at' => now()]);
    ModerationEditorArea::create(['moderation_editor_summary_id' => $removed->id, 'watched_area_id' => $area->id, 'refresh_token' => 'original']);
    $full = ModerationProcess::create(['name' => 'summaries:rebuild', 'state' => 'complete', 'run_number' => 7]);
    $before = $unselected->fresh()->getAttributes();
    $areaBefore = $area->fresh()->getAttributes();
    Queue::fake();

    $this->artisan('moderation:process summaries --limit=1 --rebuild --sync')->assertSuccessful();

    expect($selected->fresh()->rebuild_run)->toBe(7)
        ->and($unselected->fresh()->getAttributes())->toBe($before)
        ->and($removed->fresh())->not->toBeNull()
        ->and(ModerationEditorArea::sole()->refresh_token)->toBe('original')
        ->and($area->fresh()->getAttributes())->toBe($areaBefore)
        ->and($full->fresh()->run_number)->toBe(7)
        ->and(ModerationProcess::where('name', 'summaries:limit:1:rebuild')->sole()->state)->toBe('complete');
    Queue::assertNothingPushed();
});

test('summary scopes and full rebuilds exclude each other while jobs are pending', function (string $active, string $command) {
    $this->sourceChangeset();
    ModerationProcess::create(['name' => $active, 'state' => 'queued', 'pending_jobs' => 1, 'total_jobs' => 1]);
    Queue::fake();

    $this->artisan('moderation:process '.$command)->expectsOutputToContain('Already running:')->assertSuccessful();

    expect(ModerationProcess::count())->toBe(1)
        ->and(ModerationEditorSummary::count())->toBe(0);
    Queue::assertNothingPushed();
})->with([
    ['summaries:limit:1', 'summaries --rebuild'],
    ['summaries:rebuild', 'summaries --user=123'],
    ['summaries', 'summaries --limit=1 --rebuild'],
]);

test('rules apply every enabled rule to the same limited distinct nodes', function () {
    config(['moderation.processing.dispatch_chunk_size' => 1]);
    WatchedArea::factory()->create();
    $rules = ModerationRule::factory()->count(2)->create(['enabled' => true]);
    ModerationRule::factory()->create(['enabled' => false]);
    foreach ([203, 200, 202, 201] as $node) {
        $this->sourceNode($node);
    }
    $this->sourceNode(200, 2);
    Queue::fake();

    $this->artisan('moderation:process rules --limit=3')
        ->expectsOutputToContain('Selected 3 nodes; queued 6 rule evaluations.')
        ->assertSuccessful();

    foreach ($rules as $rule) {
        expect(Queue::pushed(ProcessModeration::class)->where('ruleId', $rule->id)->pluck('target')->all())->toBe([200, 201, 202]);
    }
    Queue::assertPushedTimes(ProcessModeration::class, 6);
    expect(ModerationProcess::where('name', 'like', 'scoped-rule:%')->count())->toBe(2);
});

test('rule and editor filters select only the editors tracked nodes', function () {
    WatchedArea::factory()->create();
    $rule = ModerationRule::factory()->create(['enabled' => true]);
    ModerationRule::factory()->create(['enabled' => true]);
    $this->sourceNode(199, 1, ['osm_uid' => 456]);
    $this->sourceNode(200);
    $this->sourceNode(200, 2, ['osm_uid' => 456]);
    $this->sourceNode(201);
    Queue::fake();

    $this->artisan('moderation:process rules --rule='.$rule->id.' --user=123 --limit=1')->assertSuccessful();

    expect(Queue::pushed(ProcessModeration::class)->sole())->target->toBe(200)->ruleId->toBe($rule->id);
});

test('a synchronous selected rule persists flags without establishing global readiness', function () {
    WatchedArea::factory()->create();
    $rule = ModerationRule::factory()->create(['enabled' => true]);
    $this->sourceNode();
    $this->sourceNode(201);
    $unrelated = ModerationEditorSummary::create(['osm_uid' => 456]);
    Queue::fake();

    $this->artisan('moderation:process rules --rule='.$rule->id.' --node=200 --sync')
        ->expectsOutputToContain('Selected 1 nodes; completed 1 rule evaluations.')
        ->assertSuccessful();

    expect(ModerationFlag::active()->sole())->node_id->toBe(200)->rule_id->toBe($rule->id)
        ->and(ModerationEvaluation::sole()->node_id)->toBe(200)
        ->and(app(ModerationSummaries::class)->rulesReady())->toBeFalse()
        ->and($unrelated->fresh()->dirty_at)->toBeNull()
        ->and(ModerationProcess::where('name', 'rule:'.$rule->id.':1')->exists())->toBeFalse();
    Queue::assertNothingPushed();
});

test('scoped rule completion never invalidates all editors even when full rules are ready', function () {
    WatchedArea::factory()->create();
    $rule = ModerationRule::factory()->create(['enabled' => true]);
    $full = ModerationProcess::create(['name' => 'rule:'.$rule->id.':1', 'state' => 'complete', 'last_success_at' => now(), 'run_number' => 4]);
    $this->sourceNode();
    $unrelated = ModerationEditorSummary::create(['osm_uid' => 456]);
    $before = $full->fresh()->getAttributes();

    $this->artisan('moderation:process rules --limit=1 --sync')->assertSuccessful();

    expect($unrelated->fresh()->dirty_at)->toBeNull()
        ->and($full->fresh()->getAttributes())->toBe($before);
});

test('rule processing only queues nodes within an area', function () {
    WatchedArea::factory()->create();
    $rule = ModerationRule::factory()->create(['enabled' => true]);
    $this->sourceNode(200);
    $this->sourceNode(201, attributes: ['latitude' => 32.0, 'longitude' => -100.0]);
    Queue::fake();

    $this->artisan('moderation:process rules')->assertSuccessful();

    expect(Queue::pushed(ProcessModeration::class)->pluck('target')->all())->toBe([200])
        ->and(ModerationProcess::where('name', 'rule:'.$rule->id.':1')->sole()->total_jobs)->toBe(1);
});

test('limited rules without enabled rules do not establish full readiness', function () {
    $this->artisan('moderation:process rules --limit=1 --sync')
        ->expectsOutputToContain('Selected 0 nodes; completed 0 rule evaluations.')
        ->assertSuccessful();

    expect(app(ModerationSummaries::class)->rulesReady())->toBeFalse();
});

test('invalid processing options fail before creating runs', function (string $arguments) {
    Queue::fake();

    $this->artisan('moderation:process '.$arguments)->assertExitCode(2);

    expect(ModerationProcess::count())->toBe(0);
    Queue::assertNothingPushed();
})->with([
    'summaries --limit=0', 'outcomes --limit=-1', 'rules --limit=abc', 'rules --limit=1.5',
    'rules --rule=0', 'outcomes --node=99999999999999999999999999', 'summaries --user=abc',
    'rules --node=1 --user=2', 'outcomes --rule=1', 'summaries --node=1',
    'profiles --limit=1', 'warm --user=1', 'status --sync', 'status --rebuild', 'status --limit=1',
    'rules --rebuild', 'outcomes --sync', 'outcomes --user=123 --sync', 'rules --rule=1 --sync',
    'summaries --sync', 'profiles --sync',
    'outcomes --limit', 'outcomes --node', 'summaries --user', 'rules --rule',
]);

test('missing explicit targets fail before creating runs', function (string $arguments, string $message) {
    Queue::fake();

    $this->artisan('moderation:process '.$arguments)->expectsOutputToContain($message)->assertExitCode(2);

    expect(ModerationProcess::count())->toBe(0);
    Queue::assertNothingPushed();
})->with([
    ['outcomes --node=999', 'No tracked node found'],
    ['rules --node=999', 'No tracked node found'],
    ['summaries --user=999', 'No tracked data found'],
    ['outcomes --user=999', 'No tracked data found'],
    ['rules --user=999', 'No tracked data found'],
    ['rules --rule=999', 'does not exist or is disabled'],
]);

test('disabled explicit rules are rejected without saving a run', function () {
    $rule = ModerationRule::factory()->create(['enabled' => false]);
    $this->artisan('moderation:process rules --rule='.$rule->id)->expectsOutputToContain('does not exist or is disabled')->assertExitCode(2);
    expect(ModerationProcess::count())->toBe(0);
});

test('synchronous processing stops at the first failure with correct accounting and retained writes', function () {
    foreach ([200, 201, 202] as $node) {
        $this->sourceNode($node);
    }
    $processor = app(ModerationOutcomeProcessor::class);
    $this->mock(ModerationOutcomeProcessor::class, function ($mock) use ($processor): void {
        $mock->shouldReceive('process')->once()->with(200)->andReturnUsing(fn () => $processor->process(200));
        $mock->shouldReceive('process')->once()->with(201)->andThrow(new RuntimeException('Test failure'));
        $mock->shouldNotReceive('process')->with(202);
    });
    Queue::fake();

    $this->artisan('moderation:process outcomes --limit=3 --sync')
        ->expectsOutputToContain('Failed outcome 201: Test failure')
        ->expectsOutputToContain('Completed 1 jobs; failed 1 jobs')
        ->assertExitCode(1);

    expect(ModerationContribution::pluck('node_id')->all())->toBe([200])
        ->and(ModerationProcess::sole())->state->toBe('failed')->total_jobs->toBe(2)->pending_jobs->toBe(0)->failed_jobs->toBe(1)->last_success_at->toBeNull()
        ->and(Cache::get('moderation:summary-generation'))->not->toBeNull();
    Queue::assertNothingPushed();
});

test('synchronous jobs fail on queued target locks and can retry after release', function () {
    $this->sourceNode();
    $job = new ProcessModeration('outcome', 200);
    $middleware = $job->middleware()[0];
    $lock = Cache::lock($middleware->getLockKey($job), $middleware->expiresAfter);
    expect($lock->get())->toBeTrue();
    Queue::fake();
    try {
        $this->artisan('moderation:process outcomes --node=200 --sync')
            ->expectsOutputToContain('Target is already being processed')
            ->expectsOutputToContain('Completed 0 jobs; failed 1 jobs')
            ->assertExitCode(1);
        expect(ModerationContribution::count())->toBe(0)
            ->and(ModerationProcess::sole())->state->toBe('failed')->pending_jobs->toBe(0)->failed_jobs->toBe(1);
    } finally {
        $lock->release();
    }

    $this->artisan('moderation:process outcomes --node=200 --sync')->assertSuccessful();
    expect(ModerationContribution::count())->toBe(1)
        ->and(ModerationProcess::sole())->state->toBe('complete')->run_number->toBe(2)->failed_jobs->toBe(0)->pending_jobs->toBe(0);
    $this->artisan('moderation:process status')->expectsOutputToContain('outcomes:node:200')->assertSuccessful();
    Queue::assertNothingPushed();
});

test('synchronous requests report existing active scopes as unsuccessful', function () {
    $this->sourceNode();
    ModerationProcess::create(['name' => 'outcomes:node:200', 'state' => 'queued', 'pending_jobs' => 1, 'total_jobs' => 1]);

    $this->artisan('moderation:process outcomes --node=200 --sync')->expectsOutputToContain('Already running:')->assertExitCode(1);
    expect(ModerationProcess::sole()->pending_jobs)->toBe(1)
        ->and(ModerationContribution::count())->toBe(0);
});

test('synchronous rules stop before later rules when a process scope is already active', function () {
    $rules = ModerationRule::factory()->count(2)->create(['enabled' => true]);
    $this->sourceNode();
    ModerationProcess::create(['name' => 'scoped-rule:'.$rules[0]->id.':1:limit:1', 'state' => 'queued', 'total_jobs' => 1, 'pending_jobs' => 1]);

    $this->artisan('moderation:process rules --limit=1 --sync')->expectsOutputToContain('Already running:')->assertExitCode(1);

    expect(ModerationProcess::count())->toBe(1)
        ->and(ModerationEvaluation::count())->toBe(0);
});
