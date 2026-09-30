<?php

namespace Database\Factories;

use App\Models\AlprPresenceReport;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<AlprPresenceReport> */
class AlprPresenceReportFactory extends Factory
{
    public function definition(): array
    {
        return [
            'osm_node_id' => fake()->numberBetween(1, 10000000), 'response' => 'not_there', 'platform' => 'android_auto',
            'passed_at' => now()->subSeconds(10), 'occurred_at' => now()->subSeconds(5), 'submitted_at' => now(), 'received_at' => now(),
            'server_node_version' => 1, 'server_latitude' => 30.5, 'server_longitude' => -97.5,
            'event_key' => fake()->uuid(), 'payload_hash' => hash('sha256', fake()->uuid()),
        ];
    }
}
