<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class RegionalRoadCorridorReleases
{
    /** @return array<string, mixed>|null */
    public function catalog(string $region, ?string $release = null): ?array
    {
        $pointer = $this->current();
        if ($pointer === null) {
            return null;
        }
        $release ??= $pointer['active_release'];
        $checksum = match ($release) {
            $pointer['active_release'] => $pointer['catalog_sha256'],
            $pointer['previous_release'] ?? null => $pointer['previous_catalog_sha256'],
            default => null,
        };
        abort_unless(is_string($checksum), 404);
        $index = $this->index($release, $checksum);
        $entry = $index['regions'][$region] ?? null;
        if ($entry === null) {
            return null;
        }
        abort_unless(preg_match('/\A-?\d{1,2}_-?\d{1,2}\z/', $region) && is_string($entry['sha256'] ?? null) && preg_match('/\A[a-f0-9]{64}\z/', $entry['sha256']), 503);

        return Cache::remember('road-corridor.regional-catalog.'.$release.'.'.$region.'.'.$entry['sha256'], 300, function () use ($release, $region, $entry): array {
            $catalog = $this->read("experimental/road-corridors/{$release}/us/regions/{$region}.json", $entry['sha256']);
            abort_unless(($catalog['schema_version'] ?? null) === 1 && ($catalog['release'] ?? null) === $release && ($catalog['region'] ?? null) === $region && is_array($catalog['tiles'] ?? null) && is_array($catalog['coverage'] ?? null), 503);

            return $catalog;
        });
    }

    /** @return array<string, mixed>|null */
    public function current(): ?array
    {
        $key = config('road-corridor.regional_pointer_key');
        if (! $key) {
            return null;
        }
        $cacheKey = 'road-corridor.regional-pointer.'.hash('sha256', $key);

        $pointer = Cache::remember($cacheKey, 60, function () use ($key, $cacheKey): array {
            try {
                $contents = Storage::disk('road-corridors')->get($key);
                if ($contents === null) {
                    return Cache::get($cacheKey.'.verified', []);
                }
                $pointer = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);
                if (($pointer['schema_version'] ?? null) !== 2) {
                    throw new RuntimeException('Unsupported regional corridor pointer');
                }
                $this->index($pointer['active_release'] ?? '', $pointer['catalog_sha256'] ?? '');
                if (isset($pointer['previous_release'])) {
                    $this->index($pointer['previous_release'], $pointer['previous_catalog_sha256'] ?? '');
                }
                Cache::forever($cacheKey.'.verified', $pointer);

                return $pointer;
            } catch (Throwable $exception) {
                report($exception);

                return Cache::get($cacheKey.'.verified', []);
            }
        });

        return $pointer ?: null;
    }

    /** @return array<string, mixed> */
    public function index(string $release, string $checksum): array
    {
        abort_unless(app(RoadCorridorReleases::class)->validRelease($release) && preg_match('/\A[a-f0-9]{64}\z/', $checksum), 503);

        return Cache::remember('road-corridor.regional-index.'.$release.'.'.$checksum, 300, function () use ($release, $checksum): array {
            $index = $this->read("experimental/road-corridors/{$release}/us/index.json", $checksum);
            abort_unless(($index['schema_version'] ?? null) === 2 && ($index['release'] ?? null) === $release && ($index['region_degrees'] ?? null) === 2 && ($index['halo_degrees'] ?? 0) >= 0.3 && is_array($index['regions'] ?? null), 503);

            return $index;
        });
    }

    /** @return array<string, mixed> */
    private function read(string $key, string $checksum): array
    {
        $contents = Storage::disk('road-corridors')->get($key);
        abort_unless(is_string($contents) && strlen($contents) < 900000 && hash_equals($checksum, hash('sha256', $contents)), 503);
        $value = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);
        abort_unless(is_array($value), 503);

        return $value;
    }
}
