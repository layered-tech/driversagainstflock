<?php

namespace Database\Factories;

use App\Models\ModerationRule;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ModerationRule> */
class ModerationRuleFactory extends Factory
{
    public function definition(): array
    {
        return ['name' => fake()->sentence(3), 'description' => null, 'type' => 'missing_tags', 'severity' => 'Medium',
            'enabled' => false, 'version' => 1, 'settings' => ['keys' => ['operator'], 'blank_is_missing' => true],
            'conditions' => [], 'exceptions' => [], 'area_ids' => []];
    }
}
