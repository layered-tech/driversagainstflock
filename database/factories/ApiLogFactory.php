<?php

namespace Database\Factories;

use App\Models\ApiLog;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ApiLog>
 */
class ApiLogFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'method' => fake()->randomElement(['GET', 'POST']),
            'request_path' => 'api/'.fake()->slug(2),
            'status' => fake()->numberBetween(200, 599),
            'elapsed_ms' => fake()->numberBetween(0, 5000),
            'request_headers' => [
                'accept' => ['application/json'],
            ],
            'request_payload' => [],
            'response_headers' => [
                'content-type' => ['application/json'],
            ],
            'response_payload' => [
                'ok' => true,
            ],
        ];
    }
}
