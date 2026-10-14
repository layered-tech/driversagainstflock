<?php

namespace Database\Factories;

use App\Models\AreaDevice;
use Illuminate\Database\Eloquent\Factories\Factory;

class AreaSubscriptionFactory extends Factory
{
    public function definition(): array
    {
        $geometry = ['type' => 'Polygon', 'coordinates' => [[[-98, 30], [-97, 30], [-97, 31], [-98, 31], [-98, 30]]]];

        return ['area_device_id' => AreaDevice::factory(), 'name' => 'Austin', 'kind' => 'city', 'definition' => 'Austin, TX', 'geometry' => $geometry, 'bounds' => [-98, 30, -97, 31], 'geometry_hash' => hash('sha256', json_encode($geometry))];
    }
}
