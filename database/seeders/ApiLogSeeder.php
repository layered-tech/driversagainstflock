<?php

namespace Database\Seeders;

use App\Models\ApiLog;
use Illuminate\Database\Seeder;

class ApiLogSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        ApiLog::factory()->count(10)->create();
    }
}
