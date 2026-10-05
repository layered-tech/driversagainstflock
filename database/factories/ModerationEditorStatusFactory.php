<?php

namespace Database\Factories;

use App\Models\ModerationEditorStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ModerationEditorStatus>
 */
class ModerationEditorStatusFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'osm_uid' => fake()->unique()->numberBetween(1000000, 99999999),
            'status' => fake()->randomElement(ModerationEditorStatus::STATUSES),
            'assigned_by' => null,
        ];
    }
}
