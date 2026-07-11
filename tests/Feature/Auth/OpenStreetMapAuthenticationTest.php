<?php

use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia as Assert;

function pendingOpenStreetMapUser(array $overrides = []): array
{
    return array_merge([
        'provider_user_id' => '12345',
        'nickname' => 'road_mapper',
        'name' => 'road_mapper',
        'avatar' => 'https://www.openstreetmap.org/avatar.png',
        'token' => 'openstreetmap-token',
        'refresh_token' => null,
        'expires_at' => null,
    ], $overrides);
}

test('login page includes OpenStreetMap login action', function () {
    $response = $this->get('/login');

    $response->assertInertia(fn (Assert $page) => $page
        ->component('Auth/Login')
        ->where('openStreetMapLoginUrl', route('auth.openstreetmap.redirect'))
        ->where('mobileLogin', false)
    );
});

test('OpenStreetMap registration can be completed for a new user', function () {
    $response = $this
        ->withSession(['openstreetmap_oauth.pending_user' => pendingOpenStreetMapUser()])
        ->post(route('auth.openstreetmap.register.store'), [
            'name' => 'Road Mapper',
            'email' => 'mapper@example.com',
        ]);

    $response->assertRedirect(route('home', absolute: false));
    $this->assertAuthenticated();

    $user = User::query()->where('email', 'mapper@example.com')->first();

    expect($user)->not->toBeNull()
        ->and(Hash::needsRehash($user->password))->toBeFalse();

    $this->assertDatabaseHas('social_accounts', [
        'user_id' => $user->id,
        'provider' => 'openstreetmap',
        'provider_user_id' => '12345',
        'nickname' => 'road_mapper',
    ]);
});

test('mobile OpenStreetMap registration returns a one time code that can be exchanged for a token', function () {
    $response = $this
        ->withHeader('X-Inertia', 'true')
        ->withSession([
            'openstreetmap_oauth.pending_user' => pendingOpenStreetMapUser(),
            'mobile_oauth' => [
                'redirect_uri' => 'driversagainstflock://oauth',
                'state' => 'expected-state',
            ],
        ])
        ->post(route('auth.openstreetmap.register.store'), [
            'name' => 'Mobile Mapper',
            'email' => 'mobile-mapper@example.com',
        ]);

    $response->assertStatus(409);

    $location = $response->headers->get('X-Inertia-Location');
    parse_str(parse_url($location, PHP_URL_QUERY), $query);

    expect($location)->toStartWith('driversagainstflock://oauth')
        ->and($query)->toHaveKeys(['code', 'state'])
        ->and($query['state'])->toBe('expected-state');

    $tokenResponse = $this->postJson('/api/oauth/mobile/token', [
        'code' => $query['code'],
        'device_name' => 'Feature Test',
    ]);

    $tokenResponse
        ->assertOk()
        ->assertJsonStructure([
            'token',
            'user' => ['id', 'name', 'email'],
            'permissions',
        ]);

    $this->assertDatabaseHas('personal_access_tokens', [
        'name' => 'Feature Test',
    ]);

    $this->postJson('/api/oauth/mobile/token', [
        'code' => $query['code'],
        'device_name' => 'Feature Test',
    ])->assertUnprocessable();
});

test('existing OpenStreetMap social account can receive a mobile login code after password login', function () {
    $user = User::factory()->create([
        'email' => 'existing@example.com',
    ]);

    SocialAccount::create([
        'user_id' => $user->id,
        'provider' => 'openstreetmap',
        'provider_user_id' => '12345',
        'nickname' => 'road_mapper',
    ]);

    $this->get('/login?mobile_redirect_uri=driversagainstflock%3A%2F%2Foauth&mobile_state=password-state');

    $response = $this
        ->withHeader('X-Inertia', 'true')
        ->post('/login', [
            'email' => 'existing@example.com',
            'password' => 'password',
        ]);

    $response->assertStatus(409);

    $location = $response->headers->get('X-Inertia-Location');
    parse_str(parse_url($location, PHP_URL_QUERY), $query);

    expect($location)->toStartWith('driversagainstflock://oauth')
        ->and($query)->toHaveKeys(['code', 'state'])
        ->and($query['state'])->toBe('password-state');
});
