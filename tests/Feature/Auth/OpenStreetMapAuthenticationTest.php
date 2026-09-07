<?php

use App\Models\User;
use Illuminate\Routing\Middleware\ThrottleRequestsWithRedis;
use Illuminate\Support\Env;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Telescope\Telescope;

beforeEach(function (): void {
    config(['inertia.ssr.enabled' => false]);
    config(['moderation.oauth.client_id' => 'web-client', 'moderation.oauth.client_secret' => 'web-secret', 'moderation.approved_osm_ids' => ['123']]);
    $this->withoutMiddleware(ThrottleRequestsWithRedis::class);
    Http::preventStrayRequests();
});
function osmCallbackState(): array
{
    return ['state' => str_repeat('s', 64), 'verifier' => str_repeat('v', 96), 'expires_at' => now()->addMinutes(10)->timestamp];
}
test('osm sign in requests only identity permission with state and PKCE', function () {
    $response = $this->get(route('login.osm'));
    parse_str(parse_url($response->headers->get('Location'), PHP_URL_QUERY), $query);
    expect($query)->toMatchArray(['client_id' => 'web-client', 'scope' => 'read_prefs', 'response_type' => 'code', 'code_challenge_method' => 'S256'])
        ->and(strlen($query['state']))->toBe(64)->and($query['code_challenge'])->not->toBeEmpty();
    $response->assertSessionHas('osm_oauth.state', $query['state']);
    Http::assertNothingSent();
});
test('web base URL controls authorization token exchange and profile requests', function (string $baseUrl) {
    $environment = Env::getRepository();
    $originalValues = ['OSM_WEB_URL' => $environment->get('OSM_WEB_URL'), 'OSM_WEB_API_URL' => $environment->get('OSM_WEB_API_URL')];

    try {
        foreach ($originalValues as $key => $value) {
            $environment->clear($key);
        }
        $environment->set('OSM_WEB_URL', $baseUrl);
        $settings = require config_path('moderation.php');
    } finally {
        foreach ($originalValues as $key => $value) {
            $environment->clear($key);
            if ($value !== null) {
                $environment->set($key, $value);
            }
        }
    }

    config(['moderation.oauth.url' => $settings['oauth']['url'], 'moderation.oauth.api_url' => $settings['oauth']['api_url']]);
    $host = 'https://api06.dev.openstreetmap.org';
    $response = $this->get(route('login.osm'));
    expect($response->headers->get('Location'))->toStartWith($host.'/oauth2/authorize?');

    Http::fake([
        $host.'/oauth2/token' => Http::response(['access_token' => 'dev-token']),
        $host.'/api/0.6/user/details.json' => Http::response(['user' => ['id' => 123, 'display_name' => 'mapper']]),
    ]);
    $this->withSession(['osm_oauth' => osmCallbackState()])
        ->get(route('login.osm.callback', ['state' => str_repeat('s', 64), 'code' => 'code']))
        ->assertRedirect(route('moderation.index'));
    $this->assertAuthenticated();
    Http::assertSentCount(2);
})->with(['https://api06.dev.openstreetmap.org', 'https://api06.dev.openstreetmap.org/']);

test('approved OSM identity creates an authenticated moderator session without email linking', function () {
    $other = User::factory()->create(['name' => 'mapper']);
    Http::fake(['*/oauth2/token' => Http::response(['access_token' => 'private-token']), '*/user/details.json' => Http::response(['user' => ['id' => 123, 'display_name' => 'mapper']])]);
    $response = $this->withSession(['osm_oauth' => osmCallbackState()])->get(route('login.osm.callback', ['state' => str_repeat('s', 64), 'code' => 'oauth-code']));
    $response->assertRedirect(route('moderation.index'))->assertSessionHas('osm_authenticated_uid', '123')->assertSessionMissing('osm_oauth');
    $this->assertAuthenticated();
    expect(auth()->id())->not->toBe($other->id)->and(auth()->user()->osm_uid)->toBe(123)->and(auth()->user()->email)->toBeNull();
    Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/oauth2/token') && $request['code_verifier'] === str_repeat('v', 96));
});
test('unapproved identities cannot create accounts or sessions', function () {
    Http::fake(['*/oauth2/token' => Http::response(['access_token' => 'token']), '*/user/details.json' => Http::response(['user' => ['id' => 456, 'display_name' => 'unapproved']])]);
    $this->withSession(['osm_oauth' => osmCallbackState()])->get(route('login.osm.callback', ['state' => str_repeat('s', 64), 'code' => 'code']))->assertRedirect(route('login'))->assertSessionHas('osm_login_state', 'unapproved');
    $this->assertGuest();
    $this->assertDatabaseCount('users', 0);
});
test('oauth rejects missing mismatched expired and replayed state before token exchange', function (string $scenario) {
    $state = osmCallbackState();
    if ($scenario === 'expired') {
        $state['expires_at'] = now()->subMinute()->timestamp;
    }
    $session = $scenario === 'missing' ? [] : ['osm_oauth' => $state];
    $url = route('login.osm.callback', ['state' => $scenario === 'mismatch' ? 'wrong' : str_repeat('s', 64), 'code' => 'code']);
    $this->withSession($session)->get($url)->assertSessionHas('osm_login_state', 'error');
    $this->assertGuest();
    Http::assertNothingSent();
})->with(['missing', 'mismatch', 'expired']);
test('cancelled authorization and provider failures use the design states', function () {
    $this->withSession(['osm_oauth' => osmCallbackState()])->get(route('login.osm.callback', ['state' => str_repeat('s', 64), 'error' => 'access_denied']))->assertSessionHas('osm_login_state', 'denied');
    Http::assertNothingSent();
    Http::fake(['*/oauth2/token' => Http::failedConnection()]);
    $this->withSession(['osm_oauth' => osmCallbackState()])->get(route('login.osm.callback', ['state' => str_repeat('s', 64), 'code' => 'code']))->assertSessionHas('osm_login_state', 'error');
    $this->get('/login')->assertOk()->assertInertia(fn (Assert $page) => $page->component('Auth/Login')->where('loginState', 'error'));
});

test('oauth tokens are excluded from Telescope recordings', function () {
    Telescope::startRecording();
    Http::fake(['*/oauth2/token' => Http::response(['access_token' => 'oauth-secret-not-for-logs']), '*/user/details.json' => Http::response(['user' => ['id' => 123, 'display_name' => 'mapper']])]);
    $this->withSession(['osm_oauth' => osmCallbackState()])->get(route('login.osm.callback', ['state' => str_repeat('s', 64), 'code' => 'code']))->assertRedirect(route('moderation.index'));
    expect(json_encode(Telescope::$entriesQueue))->not->toContain('oauth-secret-not-for-logs')->not->toContain('web-secret');
    Telescope::stopRecording();
});
