<?php

test('web registration directs users to OpenStreetMap sign in', function () {
    $this->get('/register')->assertRedirect('/login');
});

test('password registration is not available on the web', function () {
    $this->post('/register', ['name' => 'Test User', 'email' => 'test@example.com', 'password' => 'password', 'password_confirmation' => 'password'])->assertStatus(405);
    $this->assertGuest();
});
