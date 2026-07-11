<?php

use App\Services\Directions\DirectionParser;
use App\Services\Directions\DirectionRange;

test('it parses numeric and named directions', function () {
    $parser = new DirectionParser;

    expect($parser->parse('90'))
        ->toBeInstanceOf(DirectionRange::class)
        ->start->toBe(90.0)
        ->end->toBe(90.0)
        ->and($parser->parse('-10')->start)->toBe(350.0)
        ->and($parser->parse('1000')->start)->toBe(280.0)
        ->and($parser->parse('NE')->start)->toBe(45.0)
        ->and($parser->parse('northwest')->start)->toBe(315.0)
        ->and($parser->parse('wb')->start)->toBe(270.0);
});

test('it parses direction ranges and semicolon-separated camera directions', function () {
    $parser = new DirectionParser;

    $range = $parser->parse('90-180');
    $directions = $parser->parseMany('0;160;bad data;SW - NW');

    expect($range)->toBeInstanceOf(DirectionRange::class)
        ->start->toBe(90.0)
        ->end->toBe(180.0)
        ->isRange->toBeTrue()
        ->and($directions)->toHaveCount(4)
        ->and($directions[0]->start)->toBe(0.0)
        ->and($directions[1]->start)->toBe(160.0)
        ->and($directions[2])->toBeNull()
        ->and($directions[3]->start)->toBe(225.0)
        ->and($directions[3]->end)->toBe(315.0);
});
