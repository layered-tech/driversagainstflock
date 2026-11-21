<?php

namespace App\Services\PoliceAlerts;

use App\Services\Directions\DirectionsException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WazePoliceAlertLookup
{
    private const QUOTA_COOLDOWN_KEY = 'police-alerts:quota-cooldown-until';

    private const FAILURE_COOLDOWN_KEY = 'police-alerts:failure-cooldown-until';

    /**
     * Share a five-minute snapshot across a 0.05-degree cell (~5km).
     * The first caller supplies the center of the upstream 10-mile search.
     *
     * @return list<array<string, mixed>>
     */
    public function find(float $latitude, float $longitude): array
    {
        $cacheKey = sprintf(
            'police-alerts:%0.2f:%0.2f',
            round($latitude * 20) / 20,
            round($longitude * 20) / 20,
        );

        $cached = Cache::get($cacheKey);

        if (is_array($cached)) {
            return $cached;
        }

        $this->ensureAvailable();
        $lock = Cache::lock($cacheKey.':lock', 15);

        if (! $lock->get()) {
            throw new PoliceAlertsUnavailable(60);
        }

        try {
            return Cache::remember(
                $cacheKey,
                now()->addSeconds((int) config('police-alerts.cache_seconds')),
                fn () => $this->fetch($latitude, $longitude),
            );
        } finally {
            $lock->release();
        }
    }

    private function ensureAvailable(): void
    {
        $remaining = max(
            (int) Cache::get(self::QUOTA_COOLDOWN_KEY, 0),
            (int) Cache::get(self::FAILURE_COOLDOWN_KEY, 0),
        ) - now()->timestamp;

        if ($remaining > 0) {
            throw new PoliceAlertsUnavailable($remaining);
        }
    }

    private function pauseRequests(int $seconds, string $key, ?int $providerStatus = null): never
    {
        $seconds = max(1, $seconds);
        Cache::put($key, now()->timestamp + $seconds, $seconds);
        Log::warning('Police alert provider request failed.', [
            'provider_status' => $providerStatus,
            'retry_after' => $seconds,
        ]);

        throw new PoliceAlertsUnavailable($seconds, 503);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function fetch(float $latitude, float $longitude): array
    {
        $apiKey = (string) config('services.openwebninja.api_key');

        if ($apiKey === '') {
            throw DirectionsException::upstream('Police alerts are not configured.');
        }

        $this->ensureAvailable();

        try {
            $response = Http::withHeaders(['x-api-key' => $apiKey])
                ->accept('application/json')
                ->connectTimeout(3)
                ->timeout(6)
                ->get(config('police-alerts.url'), [
                    'center' => sprintf('%F,%F', $latitude, $longitude),
                    'radius' => (int) config('police-alerts.radius_miles'),
                    'radius_units' => 'MI',
                    'alert_types' => 'POLICE',
                    'max_alerts' => (int) config('police-alerts.max_alerts'),
                    'max_jams' => 0,
                ]);
        } catch (ConnectionException) {
            $this->pauseRequests((int) config('police-alerts.failure_cooldown_seconds'), self::FAILURE_COOLDOWN_KEY);
        }

        if ($response->status() === 429) {
            $retryAfter = $response->header('Retry-After');
            $seconds = is_numeric($retryAfter)
                ? (int) $retryAfter
                : max(0, (int) strtotime($retryAfter) - now()->timestamp);

            $this->pauseRequests(max((int) config('police-alerts.quota_cooldown_seconds'), $seconds), self::QUOTA_COOLDOWN_KEY, 429);
        }

        if ($response->status() === 402) {
            $this->pauseRequests((int) config('police-alerts.quota_cooldown_seconds'), self::QUOTA_COOLDOWN_KEY, 402);
        }

        if (! $response->successful()) {
            $this->pauseRequests((int) config('police-alerts.failure_cooldown_seconds'), self::FAILURE_COOLDOWN_KEY, $response->status());
        }

        $alerts = [];

        foreach ($response->json('data.alerts', []) as $alert) {
            $normalizedAlert = $this->normalizeAlert($alert);

            if ($normalizedAlert !== null) {
                $alerts[] = $normalizedAlert;
            }
        }

        return $alerts;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function normalizeAlert(mixed $alert): ?array
    {
        if (! is_array($alert)) {
            return null;
        }

        $latitude = $alert['latitude'] ?? null;
        $longitude = $alert['longitude'] ?? null;
        $type = is_string($alert['type'] ?? null) ? strtoupper(trim($alert['type'])) : '';

        if (! is_numeric($latitude) || ! is_numeric($longitude) || $type !== 'POLICE') {
            return null;
        }

        $latitude = (float) $latitude;
        $longitude = (float) $longitude;

        if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
            return null;
        }

        return [
            'id' => (string) ($alert['alert_id'] ?? sprintf('%F,%F', $latitude, $longitude)),
            'city' => is_string($alert['city'] ?? null) ? $alert['city'] : '',
            'confidence' => is_numeric($alert['alert_confidence'] ?? null) ? (int) $alert['alert_confidence'] : null,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'num_thumbs_up' => is_numeric($alert['num_thumbs_up'] ?? null) ? (int) $alert['num_thumbs_up'] : 0,
            'published_at' => is_string($alert['publish_datetime_utc'] ?? null) ? $alert['publish_datetime_utc'] : null,
            'reliability' => is_numeric($alert['alert_reliability'] ?? null) ? (int) $alert['alert_reliability'] : null,
            'street' => is_string($alert['street'] ?? null) ? $alert['street'] : '',
            'subtype' => is_string($alert['subtype'] ?? null) ? $alert['subtype'] : '',
        ];
    }
}
