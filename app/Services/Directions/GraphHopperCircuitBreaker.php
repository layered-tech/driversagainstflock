<?php

namespace App\Services\Directions;

use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Cache;

class GraphHopperCircuitBreaker
{
    private const FAILURES_KEY = 'directions:graphhopper:failures';

    private const OPEN_KEY = 'directions:graphhopper:open';

    public function allowsRequest(): bool
    {
        return ! $this->cache()->has(self::OPEN_KEY);
    }

    public function recordSuccess(): void
    {
        $this->cache()->forget(self::FAILURES_KEY);
        $this->cache()->forget(self::OPEN_KEY);
    }

    public function recordFailure(): void
    {
        $cache = $this->cache();
        $cache->add(
            self::FAILURES_KEY,
            0,
            now()->addSeconds((int) config('directions.graphhopper.circuit_breaker.failure_window_seconds')),
        );
        $failures = (int) $cache->increment(self::FAILURES_KEY);

        if ($failures < (int) config('directions.graphhopper.circuit_breaker.failure_threshold')) {
            return;
        }

        $cache->put(
            self::OPEN_KEY,
            true,
            now()->addSeconds((int) config('directions.graphhopper.circuit_breaker.cooldown_seconds')),
        );
        $cache->forget(self::FAILURES_KEY);
    }

    private function cache(): Repository
    {
        return Cache::store((string) config('directions.graphhopper.circuit_breaker.store'));
    }
}
