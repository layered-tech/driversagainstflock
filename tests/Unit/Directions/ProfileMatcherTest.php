<?php

use App\Services\Directions\ProfileMatcher;

test('it treats profile tags as and conditions and profiles as or conditions', function () {
    $matcher = new ProfileMatcher;
    $profiles = [
        [
            'id' => 'flock',
            'tags' => [
                'surveillance:type' => 'ALPR',
                'manufacturer' => 'Flock Safety',
            ],
        ],
        [
            'id' => 'generic',
            'tags' => [
                'surveillance:type' => 'ALPR',
            ],
        ],
    ];

    expect($matcher->tagsMatch([
        'surveillance:type' => 'ALPR',
        'manufacturer' => 'Motorola',
    ], $profiles))->toBeTrue()
        ->and($matcher->tagsMatch([
            'surveillance:type' => 'camera',
            'manufacturer' => 'Flock Safety',
        ], $profiles))->toBeFalse();
});

test('it can classify local flock marker types for alpr-style profiles', function () {
    $matcher = new ProfileMatcher;

    expect($matcher->markerTypeMatches('falcon-sr', [[
        'tags' => ['surveillance:type' => 'ALPR'],
    ]]))->toBeTrue()
        ->and($matcher->markerTypeMatches('falcon-sr', [[
            'tags' => ['surveillance:brand' => 'ShotSpotter'],
        ]]))->toBeFalse()
        ->and($matcher->markerTypeMatches('unknown', [[
            'tags' => ['surveillance:type' => 'ALPR'],
        ]]))->toBeFalse();
});
