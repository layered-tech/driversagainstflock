<?php

namespace App\Services\OpenStreetMap;

use Closure;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class ModerationSummaryCache
{
    public function invalidate(): void
    {
        Cache::forever('moderation:summary-generation', Str::random(24));
    }

    public function remember(string $name, array $filters, Closure $calculate): array
    {
        ksort($filters);
        $generation = Cache::get('moderation:summary-generation', 'initial');
        $key = 'moderation:summary:v2:'.hash('sha256', json_encode([$generation, $name, $filters, now()->utc()->toDateString()], JSON_THROW_ON_ERROR));
        $fresh = (int) config('moderation.cache.fresh_seconds', 300);
        $stale = max($fresh + 1, (int) config('moderation.cache.stale_seconds', 600));

        return Cache::flexible($key, [$fresh, $stale], function () use ($key, $calculate): array {
            return Cache::lock($key.':calculate', 120)->block(10, function () use ($key, $calculate): array {
                $cached = Cache::get($key);
                if (is_array($cached) && now()->diffInSeconds($cached['calculated_at'], true) < (int) config('moderation.cache.fresh_seconds', 300)) {
                    return $cached;
                }

                $result = ['data' => $calculate(), 'calculated_at' => now()->toIso8601String()];
                Cache::put($key, $result, (int) config('moderation.cache.stale_seconds', 600));

                return $result;
            });
        });
    }
}
