<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\WatchedArea;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WatchedArea>
 */
class WatchedAreaFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->city(), 'kind' => 'bbox', 'definition' => '30,-98 → 31,-97', 'geometry' => ['type' => 'Polygon', 'coordinates' => [[[-98, 30], [-97, 30], [-97, 31], [-98, 31], [-98, 30]]]], 'bounds' => [-98, 30, -97, 31], 'user_id' => User::factory(),
        ];
    }
}
