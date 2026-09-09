<?php

use App\Models\ModerationFlag;
use App\Models\ModerationRule;
use App\Services\OpenStreetMap\ModerationReader;
use App\Services\OpenStreetMap\ModerationRoadLookup;
use App\Services\OpenStreetMap\ModerationRuleEvaluator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);
beforeEach(function (): void {
    $this->createModerationSource();
    Cache::flush();
    $this->ruleData = ['name' => 'Require operator', 'description' => '', 'type' => 'missing_tags', 'severity' => 'Medium', 'enabled' => true,
        'settings' => ['keys' => ['operator'], 'blank_is_missing' => true], 'conditions' => [], 'exceptions' => [], 'area_ids' => []];
});

test('rules require moderator permissions and save typed versioned configuration disabled initially', function () {
    $this->get('/moderation/rules')->assertRedirect('/login');
    $this->moderator();
    $this->post('/moderation/rules', $this->ruleData)->assertRedirect();
    $rule = ModerationRule::first();
    expect($rule->enabled)->toBeFalse()->and($rule->version)->toBe(1);
    $this->put('/moderation/rules/'.$rule->id, [...$this->ruleData, 'version' => 1])->assertRedirect();
    expect($rule->fresh()->enabled)->toBeTrue()->and($rule->versions()->count())->toBe(2);
    $this->put('/moderation/rules/'.$rule->id, [...$this->ruleData, 'version' => 1])->assertSessionHasErrors('version');
    $this->get('/moderation/rules')->assertInertia(fn (Assert $page) => $page->component('Moderation/Rules')->has('rules', 1));
    $this->get('/moderation/rules/'.$rule->id.'/edit')->assertInertia(fn (Assert $page) => $page->component('Moderation/RuleForm')->has('versions', 2));
    config(['moderation.approved_osm_ids' => []]);
    $this->post('/moderation/rules/preview', $this->ruleData)->assertForbidden();
});

test('preview creates no flags and rejects executable or invalid settings', function () {
    $this->moderator();
    $this->sourceNode();
    $this->postJson('/moderation/rules/preview', $this->ruleData)->assertOk()->assertJsonPath('results.0.state', 'matched');
    $this->assertDatabaseCount('moderation_flags', 0);
    $this->assertDatabaseCount('moderation_evaluations', 0);
    $this->postJson('/moderation/rules/preview', [...$this->ruleData, 'settings' => ['expression' => 'exec()']])->assertUnprocessable();
    $this->postJson('/moderation/rules/preview', [...$this->ruleData, 'type' => 'road_distance', 'settings' => ['distance_meters' => -1, 'road_types' => ['.*']]])->assertUnprocessable();
});

test('dismissals survive identical evidence and clear nodes resolve flags', function () {
    $this->moderator();
    $rule = ModerationRule::factory()->create([...$this->ruleData, 'version' => 1]);
    $this->sourceNode();
    $reader = app(ModerationReader::class);
    $evaluator = app(ModerationRuleEvaluator::class);
    $node = $reader->normalize($reader->nodes()->first());
    $evaluator->evaluate($rule, $node);
    $flag = ModerationFlag::first();
    $this->patch('/moderation/flags/'.$flag->id.'/dismiss', ['evidence_hash' => $flag->evidence_hash])->assertRedirect();
    $evaluator->evaluate($rule, [...$node, 'osm_version' => 2]);
    expect($flag->fresh()->status)->toBe('dismissed')->and(ModerationFlag::count())->toBe(1);
    $rule->update(['version' => 2]);
    $evaluator->evaluate($rule, $node);
    expect($flag->fresh()->status)->toBe('open');
    $evaluator->evaluate($rule, [...$node, 'tags' => [...$node['tags'], 'operator' => 'City']]);
    expect($flag->fresh()->status)->toBe('resolved');
    $evaluator->evaluate($rule, $node);
    $rule->update(['enabled' => false]);
    expect(ModerationFlag::active()->count())->toBe(0)->and(ModerationFlag::count())->toBe(1);
});

test('duplicate pairs are canonical and deletion resolves both endpoints', function () {
    $rule = ModerationRule::factory()->create([...$this->ruleData, 'version' => 1, 'type' => 'duplicate_nodes', 'settings' => ['distance_meters' => 10, 'match_tags' => []]]);
    $this->sourceNode(200);
    $this->sourceNode(201);
    $evaluator = app(ModerationRuleEvaluator::class);
    $reader = app(ModerationReader::class);
    foreach ($reader->nodes()->get() as $node) {
        $evaluator->evaluate($rule, $reader->normalize($node));
    }
    expect(ModerationFlag::count())->toBe(1)->and(ModerationFlag::first()->node_id)->toBe(200)->and(ModerationFlag::first()->related_node_id)->toBe(201);
    $this->sourceNode(201, 2, ['visible' => false]);
    $node = $reader->normalize($reader->nodes()->where('source.id', 201)->first());
    $evaluator->evaluate($rule, $node);
    expect(ModerationFlag::first()->status)->toBe('resolved');
});

test('road geometry uses segments filters and shared cached coverage', function () {
    Http::fake(['*' => Http::response(['elements' => [['type' => 'way', 'id' => 10, 'geometry' => [['lat' => 30.49, 'lon' => -97.5], ['lat' => 30.51, 'lon' => -97.5]]]]])]);
    $lookup = app(ModerationRoadLookup::class);
    expect($lookup->nearest(30.5, -97.5, 50, ['residential'])['distance_meters'])->toBeLessThan(0.1);
    $lookup->nearest(30.5, -97.5, 50, ['residential']);
    Http::assertSentCount(1);
    Http::assertSent(fn ($request) => str_contains($request['data'], 'residential') && ! str_contains($request['data'], 'maxspeed'));
});

test('failed road reevaluation preserves prior flags as stale', function () {
    $rule = ModerationRule::factory()->create([...$this->ruleData, 'version' => 1, 'type' => 'road_distance', 'settings' => ['distance_meters' => 50, 'road_types' => ['primary']]]);
    $this->sourceNode();
    $reader = app(ModerationReader::class);
    $node = $reader->normalize($reader->nodes()->first());
    Http::fake(['*' => Http::sequence()->push(['elements' => []])->push(['elements' => [], 'remark' => 'timeout'])]);
    app(ModerationRuleEvaluator::class)->evaluate($rule, $node);
    expect(ModerationFlag::first()->status)->toBe('open');
    Cache::flush();
    $result = app(ModerationRuleEvaluator::class)->evaluate($rule, $node);
    expect($result['state'])->toBe('not_evaluated')->and(ModerationFlag::first()->stale)->toBeTrue()->and(ModerationFlag::first()->status)->toBe('open');
});

test('road threshold is inclusive and failed data never resolves matches', function (float $distance, string $state) {
    $this->sourceNode();
    $rule = new ModerationRule([...$this->ruleData, 'version' => 1, 'type' => 'road_distance', 'settings' => ['distance_meters' => 50, 'road_types' => ['primary']]]);
    $this->mock(ModerationRoadLookup::class)->shouldReceive('nearest')->once()->andReturn(['road_id' => 1, 'distance_meters' => $distance]);
    $reader = app(ModerationReader::class);
    expect(app(ModerationRuleEvaluator::class)->evaluate($rule, $reader->normalize($reader->nodes()->first()), false)['state'])->toBe($state);
})->with([[49.99, 'clear'], [50.0, 'clear'], [50.01, 'matched']]);

test('invalid tags honor allowed values range and format while conditions and exceptions restrict applicability', function () {
    $this->sourceNode(200, 1, ['tags' => json_encode(['surveillance:type' => 'ALPR', 'direction' => '400', 'operator' => 'City'])]);
    $reader = app(ModerationReader::class);
    $node = $reader->normalize($reader->nodes()->first());
    $rule = new ModerationRule([...$this->ruleData, 'type' => 'invalid_tag', 'settings' => ['key' => 'direction', 'min' => 0, 'max' => 360, 'format' => 'integer'], 'conditions' => [['key' => 'operator', 'operator' => 'equals', 'value' => 'City']]]);
    $evaluator = app(ModerationRuleEvaluator::class);
    expect($evaluator->evaluate($rule, $node, false)['state'])->toBe('matched');
    $rule->exceptions = [['key' => 'operator', 'operator' => 'equals', 'value' => 'City']];
    expect($evaluator->evaluate($rule, $node, false)['state'])->toBe('clear');
    $rule->exceptions = [];
    $node['tags']['direction'] = '90';
    expect($evaluator->evaluate($rule, $node, false)['state'])->toBe('clear');
    $rule->settings = ['key' => 'operator', 'allowed_values' => ['Flock']];
    expect($evaluator->evaluate($rule, $node, false)['state'])->toBe('matched');
});

test('flagged lists only active rule matches and keeps all nodes in the ALPR table', function () {
    $this->moderator();
    foreach (range(200, 204) as $id) {
        $this->sourceNode($id);
    }
    $rule = ModerationRule::factory()->create([...$this->ruleData, 'version' => 1]);
    $reader = app(ModerationReader::class);
    $evaluator = app(ModerationRuleEvaluator::class);
    foreach ($reader->nodes()->whereIn('source.id', [200, 201, 202])->get() as $node) {
        $evaluator->evaluate($rule, $reader->normalize($node));
    }
    ModerationFlag::where('node_id', 201)->update(['status' => 'dismissed']);
    ModerationFlag::where('node_id', 202)->update(['status' => 'resolved']);
    $disabledRule = ModerationRule::factory()->create(['enabled' => true]);
    $evaluator->evaluate($disabledRule, $reader->normalize($reader->nodes()->where('source.id', 203)->first()));
    $disabledRule->update(['enabled' => false]);

    $this->sourceChangeset();
    $manualChangeset = $reader->changesets()->first();
    $this->patch('/moderation/changesets/100/review', ['revision' => $manualChangeset->revision, 'status' => 'Flagged'])->assertRedirect();

    $this->get('/moderation?view=flagged')->assertInertia(fn (Assert $page) => $page
        ->where('view', 'flagged')->where('source.state', 'ready')
        ->has('records.data', 1)->where('records.data.0.id', 200)
        ->has('records.data.0.flags', 1)->where('records.data.0.flags.0.rule.name', $rule->name)
        ->has('ruleOptions', 1)->where('ruleOptions.0.id', $rule->id));
    $this->get('/moderation?view=nodes')->assertInertia(fn (Assert $page) => $page->has('records.data', 5));

    $flag = ModerationFlag::where('node_id', 200)->first();
    $this->from('/moderation?view=flagged')->patch('/moderation/flags/'.$flag->id.'/dismiss', ['evidence_hash' => $flag->evidence_hash])->assertRedirect('/moderation?view=flagged');
    $this->get('/moderation?view=flagged')->assertInertia(fn (Assert $page) => $page->has('records.data', 0));
    $this->get('/moderation?view=nodes&osm_id=200')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->has('records.data.0.flags', 0));
});

test('flagged filters combine rule severity and existing node filters including related nodes', function () {
    $this->moderator();
    $this->sourceNode(200, 1, ['tags' => json_encode(['surveillance:type' => 'ALPR', 'operator' => 'City', 'direction' => '350'])]);
    $this->sourceNode(201, 1, ['osm_user' => 'other_mapper']);
    $this->sourceNode(202, 1, ['latitude' => 31.5, 'longitude' => -98.5]);
    $reader = app(ModerationReader::class);
    $evaluator = app(ModerationRuleEvaluator::class);
    $duplicate = ModerationRule::factory()->create([...$this->ruleData, 'severity' => 'High', 'type' => 'duplicate_nodes', 'settings' => ['distance_meters' => 10, 'match_tags' => []]]);
    $missing = ModerationRule::factory()->create([...$this->ruleData, 'severity' => 'Low']);
    foreach ($reader->nodes()->get() as $node) {
        $evaluator->evaluate($duplicate, $reader->normalize($node));
        $evaluator->evaluate($missing, $reader->normalize($node));
    }
    $this->get('/moderation?view=flagged&rules[]='.$duplicate->id.'&severities[]=High')->assertInertia(fn (Assert $page) => $page->has('records.data', 2));
    $this->get('/moderation?view=flagged&rules[]='.$duplicate->id.'&severities[]=Low')->assertInertia(fn (Assert $page) => $page->has('records.data', 0));
    $this->get('/moderation?view=flagged&rules[]='.$duplicate->id.'&osm_id=201&missing_direction=1')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->where('records.data.0.id', 201)->has('records.data.0.flags', 2));
    $this->get('/moderation?view=flagged&operator=City&direction_from=340&direction_to=10&user=123&changeset=100&window=24h')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->where('records.data.0.id', 200));
    $this->get('/moderation?view=flagged&rules[]=invalid')->assertSessionHasErrors('rules.0');
    $this->get('/moderation?view=flagged&severities[]=Critical')->assertSessionHasErrors('severities.0');
    $this->get('/moderation/nodes/201?from=flagged')->assertInertia(fn (Assert $page) => $page->where('from', 'flagged')->where('node.id', 201));
    $this->get('/moderation/nodes/201?from=invalid')->assertInertia(fn (Assert $page) => $page->where('from', 'nodes'));
});

test('flagged paginates matching nodes before applying the page limit', function () {
    $this->moderator();
    foreach (range(200, 401) as $id) {
        $this->sourceNode($id);
    }
    $rule = ModerationRule::factory()->create([...$this->ruleData, 'version' => 1]);
    $reader = app(ModerationReader::class);
    foreach ($reader->nodes()->where('source.id', '<', 401)->get() as $node) {
        app(ModerationRuleEvaluator::class)->evaluate($rule, $reader->normalize($node));
    }
    $this->get('/moderation?view=flagged&sort=id&order=desc')->assertInertia(fn (Assert $page) => $page
        ->has('records.data', 200)->where('records.data.0.id', 400)
        ->where('records.next_page_url', fn ($url) => str_contains($url, 'view=flagged') && str_contains($url, 'page=2')));
    $this->get('/moderation?view=flagged&sort=id&order=desc&page=2')->assertInertia(fn (Assert $page) => $page
        ->has('records.data', 1)->where('records.data.0.id', 200));
});
