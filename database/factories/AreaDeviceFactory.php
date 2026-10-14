<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class AreaDeviceFactory extends Factory
{
    public function definition(): array
    {
        return ['token_hash' => hash('sha256', bin2hex(random_bytes(32))), 'timezone' => 'America/Chicago', 'last_seen_at' => now()];
    }
}
