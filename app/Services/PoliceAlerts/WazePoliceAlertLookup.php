<?php

namespace App\Services\PoliceAlerts;

use App\Services\Directions\DirectionsException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class WazePoliceAlertLookup
{
    /**
     * Cached lists are keyed on a ~1km coordinate grid so nearby users share
     * one upstream request against the metered OpenWebNinja quota.
     *
     * @return list<array<string, mixed>>
     */
    public function find(float $latitude, float $longitude): array
    {
        $cacheKey = sprintf(
            'police-alerts:%0.2f:%0.2f',
            round($latitude, 2),
            round($longitude, 2),
        );

        return Cache::remember(
            $cacheKey,
            now()->addSeconds((int) config('police-alerts.cache_seconds')),
            fn () => $this->fetch($latitude, $longitude),
        );
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

        $this->consumeMonthlyQuota();

        $response = Http::withHeaders(['x-api-key' => $apiKey])
            ->accept('application/json')
            ->timeout(10)
            ->retry(1, 150, throw: false)
            ->get(config('police-alerts.url'), [
                'center' => sprintf('%F,%F', $latitude, $longitude),
                'radius' => (int) config('police-alerts.radius_miles'),
                'radius_units' => 'MI',
                'alert_types' => 'POLICE',
                'max_alerts' => (int) config('police-alerts.max_alerts'),
                'max_jams' => 0,
            ]);

        if (! $response->successful()) {
            throw DirectionsException::upstream('Police alerts could not be loaded.');
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
     * Atomically reserves one request against the app-wide monthly
     * OpenWebNinja budget, refusing to call upstream once it is spent.
     * Incrementing before checking means the reserved slot is never
     * exceeded even under concurrent cache misses.
     */
    private function consumeMonthlyQuota(): void
    {
        $limit = (int) config('police-alerts.monthly_request_limit');

        if ($limit <= 0) {
            return;
        }

        $quotaKey = 'police-alerts:monthly-quota:'.now()->format('Y-m');

        Cache::add($quotaKey, 0, now()->endOfMonth()->addDay());

        if (Cache::increment($quotaKey) > $limit) {
            throw DirectionsException::upstream('Police alerts are temporarily unavailable.');
        }
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
