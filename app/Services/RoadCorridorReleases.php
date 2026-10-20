<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class RoadCorridorReleases
{
    /** @return array{active_release: string, previous_release: ?string, catalog_sha256: ?string} */
    public function current(): array
    {
        $fallback = [
            'active_release' => config('road-corridor.active_release') ?: config('road-corridor.bundled_release'),
            'previous_release' => config('road-corridor.previous_release'),
            'catalog_sha256' => null,
        ];
        $key = config('road-corridor.release_pointer_key');
        if (config('road-corridor.active_release') || ! $key) {
            return $fallback;
        }

        $cacheKey = 'road-corridor.pointer.'.hash('sha256', $key);

        return Cache::remember($cacheKey, 60, function () use ($key, $cacheKey, $fallback): array {
            try {
                $contents = Storage::disk('road-corridors')->get($key);
                if ($contents === null) {
                    return Cache::get($cacheKey.'.verified', $fallback);
                }
                $pointer = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);
                if (($pointer['schema_version'] ?? null) !== 1
                    || ! $this->validRelease($pointer['active_release'] ?? null)
                    || ! is_string($pointer['catalog_sha256'] ?? null)
                    || ! preg_match('/\A[a-f0-9]{64}\z/', $pointer['catalog_sha256'])
                    || (isset($pointer['previous_release']) && ! $this->validRelease($pointer['previous_release']))) {
                    throw new RuntimeException('Invalid published road corridor pointer');
                }
                $release = [
                    'active_release' => $pointer['active_release'],
                    'previous_release' => $pointer['previous_release'] ?? null,
                    'catalog_sha256' => $pointer['catalog_sha256'],
                ];
                // Verify the published catalog before caching the new serving pointer.
                $this->catalog($release);
                Cache::forever($cacheKey.'.verified', $release);

                return $release;
            } catch (Throwable $exception) {
                report($exception);

                return Cache::get($cacheKey.'.verified', $fallback);
            }
        });
    }

    public function validRelease(mixed $release): bool
    {
        return is_string($release) && (bool) preg_match('/\A[A-Za-z0-9][A-Za-z0-9_-]{0,79}\z/', $release);
    }

    /**
     * @param  array{active_release: string, previous_release: ?string, catalog_sha256: ?string}  $release
     * @return array<string, mixed>
     */
    public function catalog(array $release): array
    {
        $id = $release['active_release'];
        abort_unless($this->validRelease($id), 503);

        return Cache::remember('road-corridor.catalog.'.hash('sha256', $id.($release['catalog_sha256'] ?? '')), 300, function () use ($release, $id): array {
            $contents = $id === config('road-corridor.bundled_release')
                ? file_get_contents(base_path('expo/assets/map/wisconsin-corridor.json'))
                : Storage::disk('road-corridors')->get("experimental/road-corridors/{$id}/wisconsin/mobile-catalog.json");
            if (! is_string($contents) || ($release['catalog_sha256'] && ! hash_equals($release['catalog_sha256'], hash('sha256', $contents)))) {
                throw new RuntimeException('Published road corridor catalog checksum mismatch');
            }
            $catalog = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);
            abort_unless(is_array($catalog) && ($catalog['release'] ?? null) === $id, 503);

            return ['schema_version' => 1, ...$catalog];
        });
    }
}
