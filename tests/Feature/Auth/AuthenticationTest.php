<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('login screen can be rendered', function () {
    $response = $this->get('/login');

    $response->assertInertia(fn (Assert $page) => $page
        ->component('Auth/Login')
        ->missing('mobileLogin')
        ->missing('openStreetMapLoginUrl')
    );
});

test('password sign in is not available on the web', function () {
    $this->post('/login', ['email' => 'test@example.com', 'password' => 'password'])->assertStatus(405);
    $this->assertGuest();
});

test('authenticated users are redirected away from guest screens to home', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/login');

    $response->assertRedirect(route('home', absolute: false));
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
