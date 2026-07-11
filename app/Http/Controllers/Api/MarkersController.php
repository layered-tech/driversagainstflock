<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Repositories\MapRepository;
use App\Services\MarkerFileCache;
use DateInterval;
use DateTimeInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controllers\HasMiddleware;
use Illuminate\Routing\Controllers\Middleware;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class MarkersController extends Controller implements HasMiddleware
{
    private const MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES = 40.0;

    private const MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES = 40.0;

    public function __construct(
        private readonly MapRepository $markerRepository,
        private readonly MarkerFileCache $markerFileCache,
    ) {}

    public static function middleware(): array
    {
        return [
            new Middleware('throttle:markers'),
        ];
    }

    public function __invoke(Request $request): array|JsonResponse|BinaryFileResponse
    {
        if (! $this->hasMarkerBounds($request)) {
            return response()->file($this->markerFileCache->getOrCreatePath(), [
                'Content-Type' => 'application/json',
                'Cache-Control' => 'public, max-age=300',
            ]);
        }

        $validator = Validator::make($request->query(), [
            'sw_lng' => ['required', 'numeric', 'between:-180,180'],
            'sw_lat' => ['required', 'numeric', 'between:-90,90'],
            'ne_lng' => ['required', 'numeric', 'between:-180,180'],
            'ne_lat' => ['required', 'numeric', 'between:-90,90'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Valid marker viewport bounds are required.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $bounds = $validator->validated();
        $swLng = (float) $bounds['sw_lng'];
        $swLat = (float) $bounds['sw_lat'];
        $neLng = (float) $bounds['ne_lng'];
        $neLat = (float) $bounds['ne_lat'];

        if ($this->markerBoundsAreTooLarge($swLng, $swLat, $neLng, $neLat)) {
            return response()->json([
                'message' => 'The requested marker viewport is too large.',
                'errors' => [
                    'bounds' => ['Zoom in to load nearby markers.'],
                ],
            ], 422);
        }

        $cacheKey = $this->markerBoundsCacheKey($swLng, $swLat, $neLng, $neLat);

        return Cache::remember(
            $cacheKey,
            $this->markersCacheTtl(),
            fn () => $this->markerRepository->getPoints($swLng, $swLat, $neLng, $neLat),
        );
    }

    private function hasMarkerBounds(Request $request): bool
    {
        foreach (['sw_lng', 'sw_lat', 'ne_lng', 'ne_lat'] as $key) {
            if ($request->query->has($key)) {
                return true;
            }
        }

        return false;
    }

    private function markerBoundsAreTooLarge(
        float $swLng,
        float $swLat,
        float $neLng,
        float $neLat,
    ): bool {
        if ($swLat > $neLat) {
            return true;
        }

        return abs($neLat - $swLat) > self::MAX_MARKER_REQUEST_LATITUDE_SPAN_DEGREES
            || $this->longitudeSpan($swLng, $neLng) > self::MAX_MARKER_REQUEST_LONGITUDE_SPAN_DEGREES;
    }

    private function longitudeSpan(float $west, float $east): float
    {
        if ($west <= $east) {
            return $east - $west;
        }

        return 360 - $west + $east;
    }

    private function markerBoundsCacheKey(
        float $swLng,
        float $swLat,
        float $neLng,
        float $neLat,
    ): string {
        return sprintf(
            'markers:%s,%s,%s,%s',
            $this->normalizeCoordinateForCache($swLng),
            $this->normalizeCoordinateForCache($swLat),
            $this->normalizeCoordinateForCache($neLng),
            $this->normalizeCoordinateForCache($neLat),
        );
    }

    private function normalizeCoordinateForCache(float $coordinate): string
    {
        return number_format($coordinate, 5, '.', '');
    }

    private function markersCacheTtl(): DateTimeInterface|DateInterval
    {
        return app()->environment('production')
            ? now()->addHours(6)
            : now()->addMinutes(5);
    }
}
