<?php

namespace Database\Factories;

use App\Models\ModerationActivity;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ModerationActivity>
 */
class ModerationActivityFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(), 'actor' => fake()->userName(), 'action' => 'changeset.reviewed', 'subject_type' => 'changeset', 'subject_id' => fake()->numberBetween(1, 9999999), 'details' => ['from' => 'Needs review', 'to' => 'Reviewed'],
        ];
    }
}
