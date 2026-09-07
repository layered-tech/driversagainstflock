<?php

namespace Database\Factories;

use App\Models\ModerationReview;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ModerationReview>
 */
class ModerationReviewFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'subject_type' => 'changeset', 'subject_id' => fake()->unique()->numberBetween(1, 9999999), 'revision' => fake()->md5(), 'status' => 'Reviewed', 'user_id' => User::factory(),
        ];
    }
}
