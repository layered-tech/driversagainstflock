<?php

use Monolog\Handler\NullHandler;

it('uses privacy-first Nightwatch collection defaults', function () {
    expect(config('nightwatch.capture_request_payload'))->toBeFalse()
        ->and(config('nightwatch.sampling.requests'))->toBe(0.1)
        ->and(config('nightwatch.sampling.commands'))->toBe(0.1)
        ->and(config('nightwatch.sampling.exceptions'))->toBe(1.0)
        ->and(config('nightwatch.sampling.scheduled_tasks'))->toBe(0.1)
        ->and(config('nightwatch.filtering.ignore_cache_events'))->toBeTrue()
        ->and(config('nightwatch.filtering.ignore_queries'))->toBeTrue()
        ->and(config('logging.channels.nightwatch.handler'))->toBe(NullHandler::class);
});
