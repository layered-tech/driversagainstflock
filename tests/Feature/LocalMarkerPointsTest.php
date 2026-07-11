<?php

use App\Models\Marker;
use App\Models\User;
use App\Repositories\MapRepository;
use Illuminate\Support\Facades\Schema;

it('stores and queries local marker points directly on markers', function () {
    $user = User::factory()->create();

    $this->withoutMiddleware();

    $this
        ->actingAs($user)
        ->postJson('/api/save', [
            'type' => 'falcon-lr',
            'bearing' => 45,
            'latitude' => 43.1,
            'longitude' => -88.2,
        ])
        ->assertSuccessful()
        ->assertJsonPath('points.0.location', [-88.2, 43.1]);

    $marker = Marker::query()->firstOrFail();

    expect(Schema::hasTable('locations'))->toBeFalse()
        ->and($marker->point->latitude)->toBe(43.1)
        ->and($marker->point->longitude)->toBe(-88.2);

    $nearby = (new MapRepository)->getPoints(-88.3, 43.0, -88.1, 43.2);
    $outside = (new MapRepository)->getPoints(-89.0, 42.0, -88.9, 42.1);

    expect($nearby['points'])->toHaveCount(1)
        ->and($nearby['points'][0]['properties']['id'])->toBe($marker->id)
        ->and($outside['points'])->toBe([]);
});
