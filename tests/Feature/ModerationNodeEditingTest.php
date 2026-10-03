<?php

use App\Models\ModerationActivity;
use App\Models\ModerationFlag;
use App\Models\ModerationRule;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Http\Events\RequestHandled;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\ThrottleRequestsWithRedis;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\Watchers\RequestWatcher;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);

beforeEach(function (): void {
    $this->createModerationSource();
    $this->moderator();
    $this->withoutMiddleware(ThrottleRequestsWithRedis::class);
    config(['inertia.ssr.enabled' => false, 'moderation.oauth.client_id' => 'web-client', 'moderation.oauth.client_secret' => 'web-secret']);
    Http::preventStrayRequests();
});

function editingFlag(string $type = 'duplicate_nodes', int $node = 200): ModerationFlag
{
    $rule = ModerationRule::factory()->create(['enabled' => true, 'type' => $type, 'settings' => match ($type) {
        'missing_tags' => ['keys' => ['operator']],
        'invalid_tag' => ['key' => 'direction', 'format' => 'direction'],
        'road_distance' => ['distance_meters' => 100, 'road_types' => ['primary']],
        default => ['distance_meters' => 25, 'match_tags' => ['operator']],
    }]);

    return ModerationFlag::create(['source' => 'rule', 'rule_id' => $rule->id, 'rule_version' => 1, 'node_id' => $node, 'related_node_id' => $type === 'duplicate_nodes' ? 100 : 0,
        'node_version' => 2, 'status' => 'open', 'evidence' => [], 'evidence_hash' => str_repeat('a', 64), 'evaluated_at' => now()]);
}

function editingToken(): array
{
    return ['uid' => '123', 'token' => Crypt::encryptString('private-edit-token'), 'expires_at' => now()->addHour()->timestamp];
}

function editingSnapshot(int $version = 2): array
{
    return ['id' => 200, 'type' => 'node', 'version' => $version, 'changeset' => 100, 'visible' => true,
        'lat' => 30.5, 'lon' => -97.5, 'timestamp' => '2026-10-03T12:00:00Z', 'tags' => ['surveillance:type' => 'ALPR', 'operator' => 'Old', 'name' => 'Keep this']];
}

function editingInput(ModerationFlag $flag, string $action = 'remove'): array
{
    return ['flag_id' => $flag->id, 'version' => 2, 'action' => $action, 'confirmed' => true, 'comment' => 'Survey confirmed duplicate node'];
}

function fakeEditingApi(array $snapshot = [], int $writeStatus = 200, int $closeStatus = 200): void
{
    $snapshot = $snapshot ?: [...editingSnapshot(3), 'changeset' => 999, 'visible' => false];
    Http::fake(function ($request) use ($snapshot, $writeStatus, $closeStatus) {
        if (str_ends_with($request->url(), '/node/200.json')) {
            return Http::response(['elements' => [editingSnapshot()]]);
        }
        if (str_ends_with($request->url(), '/changeset/create')) {
            return Http::response('999');
        }
        if (str_ends_with($request->url(), '/node/200/3.json')) {
            return Http::response(['elements' => [$snapshot]]);
        }
        if (str_ends_with($request->url(), '/node/200')) {
            return Http::response($writeStatus === 200 ? '3' : 'rejected', $writeStatus);
        }
        if (str_ends_with($request->url(), '/changeset/999/close')) {
            return Http::response('', $closeStatus);
        }
        throw new RuntimeException('Unexpected fake request: '.$request->url());
    });
}

test('editing authorization is separate from identity sign in and uses PKCE', function () {
    $response = $this->get(route('moderation.osm.edit.authorize', ['node' => 200]));
    $response->assertRedirect()->assertSessionHas('osm_edit_oauth');
    parse_str(parse_url($response->headers->get('Location'), PHP_URL_QUERY), $query);
    expect($query['scope'])->toBe('read_prefs write_api')->and($query['code_challenge_method'])->toBe('S256')
        ->and($query['redirect_uri'])->toBe(route('login.osm.callback'));
    Http::assertNothingSent();
});

test('editing callback stores only a server session token after matching moderator identity and write permission', function () {
    $this->get(route('moderation.osm.edit.authorize', ['node' => 200]));
    $oauth = session('osm_edit_oauth');
    Telescope::startRecording();
    Http::fake(['*/oauth2/token' => Http::response(['access_token' => 'private-edit-token']),
        '*/user/details.json' => Http::response(['user' => ['id' => 123]]),
        '*/permissions.json' => Http::response(['permissions' => ['allow_read_prefs', 'allow_write_api']])]);
    $this->get(route('login.osm.callback', ['code' => 'code', 'state' => $oauth['state']]))
        ->assertRedirect(route('moderation.nodes.show', 200))->assertSessionHas('osm_edit_token.uid', '123')->assertSessionMissing('osm_edit_oauth');
    expect(json_encode(Telescope::$entriesQueue))->not->toContain('private-edit-token')->not->toContain('web-secret');
    Telescope::stopRecording();
});

test('editing callback refuses mismatched identities missing write scope and replayed state', function (string $scenario) {
    $this->get(route('moderation.osm.edit.authorize', ['node' => 200]));
    $oauth = session('osm_edit_oauth');
    Http::fake(['*/oauth2/token' => Http::response(['access_token' => 'private-edit-token']),
        '*/user/details.json' => Http::response(['user' => ['id' => $scenario === 'identity' ? 456 : 123]]),
        '*/permissions.json' => Http::response(['permissions' => $scenario === 'scope' ? ['allow_read_prefs'] : ['allow_write_api']])]);
    $url = route('login.osm.callback', ['code' => 'code', 'state' => $scenario === 'state' ? 'wrong' : $oauth['state']]);
    $this->get($url)->assertSessionMissing('osm_edit_token')->assertSessionHas('osm_edit_error');
    $this->get($url)->assertSessionMissing('osm_edit_token');
})->with(['identity', 'scope', 'state']);

test('every node edit requires moderator permission authorization explicit confirmation and report ownership', function () {
    $flag = editingFlag();
    $payload = editingInput($flag);
    $this->postJson('/moderation/nodes/200/osm-edit', $payload)->assertUnprocessable()->assertJsonValidationErrors('edit');
    $this->withSession(['osm_edit_token' => editingToken()])->postJson('/moderation/nodes/200/osm-edit', [...$payload, 'confirmed' => false])->assertUnprocessable()->assertJsonValidationErrors('confirmed');
    $this->postJson('/moderation/nodes/100/osm-edit', $payload)->assertNotFound();
    $flag->update(['status' => 'resolved']);
    $this->postJson('/moderation/nodes/200/osm-edit', $payload)->assertUnprocessable()->assertJsonValidationErrors('action');
    $this->actingAs(User::factory()->create())->postJson('/moderation/nodes/200/osm-edit', $payload)->assertForbidden();
    Http::assertNothingSent();
});

test('rule specific actions restrict location and removal and preserve unrelated OSM tags', function (string $type, string $key) {
    $flag = editingFlag($type);
    $value = $type === 'invalid_tag' ? 'NE' : 'New & surveyed';
    $newNode = [...editingSnapshot(3), 'changeset' => 999, 'tags' => [...editingSnapshot()['tags'], $key => $value]];
    fakeEditingApi($newNode);
    $this->withSession(['osm_edit_token' => editingToken()])->postJson('/moderation/nodes/200/osm-edit', [...editingInput($flag, 'tags'), 'tags' => [$key => $value]])
        ->assertOk()->assertJsonPath('node.tags.'.$key, $value)->assertJsonPath('verified', true);
    Http::assertSent(fn ($request): bool => $request->method() === 'PUT' && str_ends_with($request->url(), '/node/200')
        && str_contains($request->body(), htmlspecialchars($value, ENT_XML1)) && str_contains($request->body(), 'Keep this'));
    $this->postJson('/moderation/nodes/200/osm-edit', editingInput($flag))->assertUnprocessable()->assertJsonValidationErrors('action');
    $this->postJson('/moderation/nodes/200/osm-edit', [...editingInput($flag, 'tags'), 'tags' => ['name' => 'Disallowed']])->assertUnprocessable()->assertJsonValidationErrors('tags');
})->with([['missing_tags', 'operator'], ['invalid_tag', 'direction']]);

test('road distance report allows surveyed relocation but refuses removal', function () {
    $flag = editingFlag('road_distance');
    fakeEditingApi([...editingSnapshot(3), 'changeset' => 999, 'lat' => 31.5, 'lon' => -98.5]);
    $this->withSession(['osm_edit_token' => editingToken()])->postJson('/moderation/nodes/200/osm-edit', [...editingInput($flag, 'location'), 'latitude' => 31.5, 'longitude' => -98.5])
        ->assertOk()->assertJsonPath('node.lat', 31.5);
    Http::assertSent(fn ($request): bool => $request->method() === 'PUT' && str_ends_with($request->url(), '/node/200') && str_contains($request->body(), 'lat="31.5"'));
    $this->postJson('/moderation/nodes/200/osm-edit', editingInput($flag))->assertUnprocessable()->assertJsonValidationErrors('action');
});

test('duplicate removal records the verified result and shows it in report profile and listing until ingestion', function () {
    $flag = editingFlag();
    $this->sourceNode(200, 2);
    fakeEditingApi();
    $this->withSession(['osm_edit_token' => editingToken()])->postJson('/moderation/nodes/200/osm-edit', editingInput($flag))
        ->assertOk()->assertJsonPath('node.visible', false)->assertJsonPath('node.version', 3)->assertJsonPath('closed', true);
    Http::assertSent(fn ($request): bool => $request->method() === 'DELETE' && str_ends_with($request->url(), '/node/200') && str_contains($request->body(), 'version="2"') && str_contains($request->body(), 'changeset="999"'));
    expect($flag->fresh()->stale)->toBeTrue()->and(ModerationActivity::where('action', 'node.osm_remove')->count())->toBe(1);
    $this->getJson('/moderation/nodes/200')->assertOk()->assertJsonPath('node.osm_version', 3)->assertJsonPath('node.visible', false)->assertJsonPath('node.osm_edit.pending_sync', true);
    $this->get('/moderation/flagged')->assertInertia(fn (Assert $page) => $page->where('records.data.0.osm_version', 3)->where('records.data.0.visible', false));
    $this->sourceNode(200, 3, ['visible' => false, 'tags' => '{}']);
    $this->getJson('/moderation/nodes/200')->assertJsonMissingPath('node.osm_edit');
});

test('not there reports also permit explicit removal', function () {
    $flag = editingFlag();
    $flag->update(['source' => 'alpr_presence', 'rule_id' => null, 'rule_version' => null, 'related_node_id' => 0]);
    fakeEditingApi();
    $this->withSession(['osm_edit_token' => editingToken()])->postJson('/moderation/nodes/200/osm-edit', editingInput($flag))->assertOk();
});

test('stale live versions are rejected before a changeset is created', function () {
    $flag = editingFlag();
    Http::fake(['*/node/200.json' => Http::response(['elements' => [editingSnapshot(4)]])]);
    $this->withSession(['osm_edit_token' => editingToken()])->postJson('/moderation/nodes/200/osm-edit', editingInput($flag))->assertUnprocessable()->assertJsonValidationErrors('edit');
    Http::assertSentCount(1);
    expect(ModerationActivity::count())->toBe(0);
});

test('failed writes close their changeset without declaring a removal', function (int $status) {
    $flag = editingFlag();
    fakeEditingApi(writeStatus: $status);
    $this->withSession(['osm_edit_token' => editingToken()])->postJson('/moderation/nodes/200/osm-edit', editingInput($flag))->assertUnprocessable()->assertJsonValidationErrors('edit');
    Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/changeset/999/close'));
    expect(ModerationActivity::count())->toBe(0)->and($flag->fresh()->stale)->toBeFalse();
})->with([409, 412, 403]);

test('a successful write remains saved when changeset closing or snapshot read fails', function () {
    $flag = editingFlag();
    fakeEditingApi(closeStatus: 503);
    $this->withSession(['osm_edit_token' => editingToken()])->postJson('/moderation/nodes/200/osm-edit', editingInput($flag))->assertOk()->assertJsonPath('closed', false);
    Http::fake(['*/node/200.json' => Http::response(['elements' => [editingSnapshot()]]), '*/changeset/create' => Http::response('999'),
        '*/node/200' => Http::response('3'), '*/node/200/3.json' => Http::failedConnection(), '*/changeset/999/close' => Http::response('')]);
    $this->postJson('/moderation/nodes/200/osm-edit', editingInput($flag))->assertOk()->assertJsonPath('verified', false)->assertJsonPath('node.version', 3);
    expect(ModerationActivity::where('action', 'node.osm_remove')->count())->toBe(2);
});

test('Telescope request session payloads redact editing tokens and PKCE secrets', function () {
    Telescope::startRecording();
    $request = Request::create('/moderation/nodes/200/osm-edit', 'GET');
    $request->setLaravelSession(app('session')->driver());
    $request->session()->put('osm_edit_token', editingToken());
    $request->session()->put('osm_edit_oauth', ['state' => 'secret-state', 'verifier' => 'secret-verifier']);
    (new RequestWatcher([]))->recordRequest(new RequestHandled($request, response()->json(['authorized' => false], 503)));
    $entry = collect(Telescope::$entriesQueue)->last(fn ($entry): bool => $entry->type === 'request');
    expect($entry)->not->toBeNull()->and($entry->content['session']['osm_edit_token'])->toBe('********')
        ->and($entry->content['session']['osm_edit_oauth'])->toBe('********');
    expect(Crypt::decryptString(session('osm_edit_token.token')))->toBe('private-edit-token');
    Telescope::stopRecording();
});

test('report overlay normalizes cardinal direction and honors camera direction precedence', function () {
    $this->sourceNode(200, 2);
    ModerationActivity::create(['user_id' => auth()->id(), 'actor' => 'Moderator', 'action' => 'node.osm_tags', 'subject_type' => 'node', 'subject_id' => 200,
        'details' => ['node' => [...editingSnapshot(3), 'tags' => ['surveillance:type' => 'ALPR', 'direction' => 'E', 'camera:direction' => 'NW', 'operator' => 'Surveyed']], 'verified' => true]]);
    $this->getJson('/moderation/nodes/200')->assertJsonPath('node.direction', 315)->assertJsonPath('node.operator', 'Surveyed');
});

test('expired wrong identity and malformed session tokens cannot edit', function (string $scenario) {
    $flag = editingFlag();
    $token = editingToken();
    if ($scenario === 'expired') {
        $token['expires_at'] = now()->subMinute()->timestamp;
    } elseif ($scenario === 'identity') {
        $token['uid'] = '456';
    } else {
        $token['token'] = 'bad-ciphertext';
    }
    $this->withSession(['osm_edit_token' => $token])->postJson('/moderation/nodes/200/osm-edit', editingInput($flag))->assertUnprocessable()->assertJsonValidationErrors('edit');
    Http::assertNothingSent();
})->with(['expired', 'identity', 'malformed']);

test('tag corrections reject invalid format and missing required values before calling OSM', function (string $type, string $value) {
    $flag = editingFlag($type);
    $key = $type === 'invalid_tag' ? 'direction' : 'operator';
    $this->withSession(['osm_edit_token' => editingToken()])->postJson('/moderation/nodes/200/osm-edit', [...editingInput($flag, 'tags'), 'tags' => [$key => $value]])
        ->assertUnprocessable()->assertJsonValidationErrors('tags');
    Http::assertNothingSent();
})->with([['invalid_tag', 'New & surveyed'], ['missing_tags', '   ']]);

test('an audit receipt failure cannot turn a successful OSM write into a retryable failure', function () {
    $flag = editingFlag();
    fakeEditingApi();
    ModerationActivity::creating(function (): void {
        throw new QueryException('pgsql', 'insert receipt', [], new RuntimeException('Receipt storage unavailable'));
    });
    try {
        $this->withSession(['osm_edit_token' => editingToken()])->postJson('/moderation/nodes/200/osm-edit', editingInput($flag))
            ->assertOk()->assertJsonPath('node.version', 3)->assertJsonPath('recorded', false)->assertJsonPath('closed', true);
    } finally {
        ModerationActivity::flushEventListeners();
    }
});

test('duplicate rules without matching tag keys do not offer an empty tag form', function () {
    $flag = editingFlag();
    $flag->rule->update(['settings' => ['distance_meters' => 25, 'match_tags' => []]]);
    $this->getJson('/moderation/nodes/200/osm-edit?flag_id='.$flag->id)
        ->assertOk()->assertJsonPath('authorized', false)->assertJsonPath('actions', ['location', 'remove'])->assertJsonPath('tag_keys', []);
    Http::assertNothingSent();
});
