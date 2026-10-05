<?php

use App\Models\ModerationActivity;
use Illuminate\Foundation\Http\Events\RequestHandled;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\ThrottleRequestsWithRedis;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\Watchers\RequestWatcher;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);

beforeEach(function (): void {
    $this->createModerationSource();
    $this->moderator();
    $this->withoutMiddleware(ThrottleRequestsWithRedis::class);
    config(['inertia.ssr.enabled' => false, 'moderation.oauth.client_id' => 'web-client']);
    Http::preventStrayRequests();
});

function messageToken(): array
{
    return ['uid' => '123', 'token' => Crypt::encryptString('private-message-token'), 'expires_at' => now()->addHour()->timestamp];
}

function messageInput(): array
{
    return ['recipient_id' => 456, 'version' => 2, 'subject' => 'Question about node 200', 'body' => "Hi mapper,\nCould you confirm the survey notes?"];
}

function messageSnapshot(): array
{
    return ['id' => 200, 'type' => 'node', 'version' => 2, 'uid' => 456, 'user' => 'mapper', 'lat' => 30.5, 'lon' => -97.5, 'tags' => ['surveillance:type' => 'ALPR']];
}

test('messaging authorization requests its own scope and preserves editing authorization', function () {
    $this->withSession(['osm_edit_token' => ['existing' => true]])
        ->get(route('moderation.osm.edit.authorize', ['node' => 200, 'capability' => 'messages']))
        ->assertSessionHas('osm_edit_token.existing', true);
    $oauth = session('osm_edit_oauth');
    expect($oauth['capability'])->toBe('messages');
    Http::fake(['*/oauth2/token' => Http::response(['access_token' => 'private-message-token']),
        '*/user/details.json' => Http::response(['user' => ['id' => 123]]),
        '*/permissions.json' => Http::response(['permissions' => ['allow_send_messages']])]);
    $this->get(route('login.osm.callback', ['code' => 'code', 'state' => $oauth['state']]))
        ->assertRedirect(route('moderation.nodes.show', 200))
        ->assertSessionHas('osm_message_token.uid', '123')
        ->assertSessionHas('osm_edit_token.existing', true);
});

test('messaging authorization refuses identity-only and editing-only permission', function () {
    $this->get(route('moderation.osm.edit.authorize', ['node' => 200, 'capability' => 'messages']));
    $oauth = session('osm_edit_oauth');
    Http::fake(['*/oauth2/token' => Http::response(['access_token' => 'token']),
        '*/user/details.json' => Http::response(['user' => ['id' => 123]]),
        '*/permissions.json' => Http::response(['permissions' => ['allow_write_api']])]);
    $this->get(route('login.osm.callback', ['code' => 'code', 'state' => $oauth['state']]))->assertSessionMissing('osm_message_token');
});

test('opening a message is read-only and sending requires matching unexpired moderator authorization', function (array $authorization) {
    $this->withSession(['osm_message_token' => $authorization])
        ->getJson('/moderation/nodes/200/message')->assertOk()->assertJsonPath('authorized', false);
    $this->postJson('/moderation/nodes/200/message', messageInput())->assertUnprocessable()->assertJsonValidationErrors('message');
    Http::assertNothingSent();
})->with([
    'missing' => [[]],
    'wrong identity' => [['uid' => '999', 'token' => 'token', 'expires_at' => PHP_INT_MAX]],
    'expired' => [['uid' => '123', 'token' => 'token', 'expires_at' => 0]],
]);

test('message state loads the current recipient and never sends automatically', function () {
    Http::fake(['*/node/200.json' => Http::response(['elements' => [messageSnapshot()]])]);
    $this->withSession(['osm_message_token' => messageToken()])->getJson('/moderation/nodes/200/message')
        ->assertOk()->assertJsonPath('node.uid', 456)->assertJsonPath('node.version', 2);
    Http::assertSentCount(1);
    expect(ModerationActivity::count())->toBe(0);
});

test('message sending refuses changed versions and recipient substitutions', function (array $overrides) {
    Http::fake(['*/node/200.json' => Http::response(['elements' => [messageSnapshot()]])]);
    $this->withSession(['osm_message_token' => messageToken()])
        ->postJson('/moderation/nodes/200/message', [...messageInput(), ...$overrides])->assertUnprocessable()->assertJsonValidationErrors('message');
    Http::assertSentCount(1);
})->with([[['recipient_id' => 999]], [['version' => 1]]]);

test('sending an OSM message records only the receipt and hides tokens and message content from Telescope', function () {
    Telescope::startRecording();
    Http::fake(['*/node/200.json' => Http::response(['elements' => [messageSnapshot()]]),
        '*/user/messages.json' => Http::response(['message' => ['id' => 77]], 201)]);
    $this->withSession(['osm_message_token' => messageToken()])
        ->postJson('/moderation/nodes/200/message', messageInput())->assertOk()->assertJsonPath('message_id', 77);
    Http::assertSent(fn ($request): bool => $request->method() === 'POST' && $request['recipient_id'] === 456
        && $request['title'] === messageInput()['subject'] && $request['body'] === messageInput()['body']);
    $receipt = ModerationActivity::sole();
    expect($receipt->action)->toBe('node.osm_message')->and($receipt->details)->toBe(['message_id' => 77, 'recipient_id' => 456]);
    expect(json_encode(Telescope::$entriesQueue))->not->toContain('private-message-token');
    Telescope::stopRecording();
});

test('messaging failures never create a successful receipt or retry the send', function (int $status, array $body) {
    Http::fake(['*/node/200.json' => Http::response(['elements' => [messageSnapshot()]]),
        '*/user/messages.json' => Http::response($body, $status)]);
    $this->withSession(['osm_message_token' => messageToken()])
        ->postJson('/moderation/nodes/200/message', messageInput())->assertUnprocessable()->assertJsonValidationErrors('message');
    Http::assertSentCount(2);
    expect(ModerationActivity::count())->toBe(0);
})->with([[403, []], [429, []], [500, []], [201, []]]);

test('Telescope redacts message authorization and draft content from request entries', function () {
    Telescope::startRecording();
    $request = Request::create('/moderation/nodes/200/message', 'POST', messageInput());
    $request->setLaravelSession(app('session')->driver());
    $request->session()->put('osm_message_token', messageToken());
    (new RequestWatcher([]))->recordRequest(new RequestHandled($request, response()->json(['authorized' => false], 503)));
    $entry = collect(Telescope::$entriesQueue)->last(fn ($entry): bool => $entry->type === 'request');
    expect($entry->content['session']['osm_message_token'])->toBe('********')
        ->and($entry->content['payload']['body'])->toBe('********')
        ->and($entry->content['payload']['subject'])->toBe('********');
    Telescope::stopRecording();
});
