<?php

use App\Models\User;

test('login screen can be rendered', function () {
    $response = $this->get('/login');

    $response->assertStatus(200);
});

test('users can authenticate using the login screen', function () {
    $user = User::factory()->create();

    $response = $this->post('/login', [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('home', absolute: false));
});

test('authenticated users are redirected away from guest screens to home', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/login');

    $response->assertRedirect(route('home', absolute: false));
});

test('authenticated browser sessions can receive a mobile login code', function () {
    $user = User::factory()->create();

    $response = $this
        ->actingAs($user)
        ->get('/login?mobile_redirect_uri=driversagainstflock%3A%2F%2Foauth&mobile_state=browser-state');

    $location = $response->headers->get('Location');
    parse_str(parse_url($location, PHP_URL_QUERY), $query);

    expect($location)->toStartWith('driversagainstflock://oauth')
        ->and($query)->toHaveKeys(['code', 'state'])
        ->and($query['state'])->toBe('browser-state');

    $tokenResponse = $this->postJson('/api/oauth/mobile/token', [
        'code' => $query['code'],
        'device_name' => 'Feature Test',
    ]);

    $tokenResponse
        ->assertOk()
        ->assertJsonPath('user.id', $user->id)
        ->assertJsonStructure([
            'token',
            'user' => ['id', 'name', 'email'],
            'permissions',
        ]);
});

test('users can not authenticate with invalid password', function () {
    $user = User::factory()->create();

    $this->post('/login', [
        'email' => $user->email,
        'password' => 'wrong-password',
    ]);

    $this->assertGuest();
});

test('users can logout', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post('/logout');

    $this->assertGuest();
    $response->assertRedirect('/');
});
