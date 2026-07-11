<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OsmNode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class DirectionsController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $startedAt = microtime(true);

        Log::withContext([
            'directions_request_id' => (string) Str::uuid(),
            'directions_endpoint' => 'api.directions',
        ]);

        $currentPosition = $request->get('currentPosition');
        $resultPosition = $request->get('resultPosition');

        // Extract coordinates (currentPosition and resultPosition are [longitude, latitude])
        $startLongitude = Arr::get($currentPosition, 0);
        $startLatitude = Arr::get($currentPosition, 1);
        $endLongitude = Arr::get($resultPosition, 0);
        $endLatitude = Arr::get($resultPosition, 1);

        Log::info('Legacy directions request started.', [
            'start' => ['longitude' => $startLongitude, 'latitude' => $startLatitude],
            'end' => ['longitude' => $endLongitude, 'latitude' => $endLatitude],
        ]);

        // OpenRouteService API configuration
        $baseRequestBody = [
            'coordinates' => [
                [$startLongitude, $startLatitude],
                [$endLongitude, $endLatitude],
            ],
        ];

        try {
            $directRouteStartedAt = microtime(true);

            Log::info('Legacy directions direct route request started.');

            // Direct route without avoid_polygons
            $directRouteResponse = Http::withHeaders([
                'Authorization' => config('services.openrouteservice.api_key'),
            ])->post('https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson', $baseRequestBody);

            $directRouteLogContext = [
                'status' => $directRouteResponse->status(),
                'successful' => $directRouteResponse->successful(),
                'elapsed_ms' => $this->elapsedMilliseconds($directRouteStartedAt),
            ];

            if ($directRouteResponse->serverError()) {
                Log::error('Legacy directions direct route response failed.', $directRouteLogContext);
            } elseif ($directRouteResponse->failed()) {
                Log::warning('Legacy directions direct route response failed.', $directRouteLogContext);
            } else {
                Log::info('Legacy directions direct route response received.', $directRouteLogContext);
            }

            // Get polygons for the ideal route
            $exclusionSearchZoneBufferInMeters = 5 * 1000;
            $exclusionZonesBufferInMeters = 35;

            $routeCoordinates = [
                [(float) $startLongitude, (float) $startLatitude],
                [(float) $endLongitude, (float) $endLatitude],
            ];

            $avoidNodesStartedAt = microtime(true);

            Log::info('Legacy directions avoid-node lookup started.', [
                'search_buffer_meters' => $exclusionSearchZoneBufferInMeters,
                'exclusion_buffer_meters' => $exclusionZonesBufferInMeters,
            ]);

            $avoidNodes = OsmNode::query()
                ->select(['id', 'osm_id'])
                ->selectRaw(
                    'ST_AsGeoJSON(ST_Buffer(location::geography, ?)::geometry) AS geojson',
                    [$exclusionZonesBufferInMeters],
                )
                ->nearRoute($routeCoordinates, $exclusionSearchZoneBufferInMeters)
                ->get();

            Log::info('Legacy directions avoid-node lookup completed.', [
                'node_count' => $avoidNodes->count(),
                'elapsed_ms' => $this->elapsedMilliseconds($avoidNodesStartedAt),
            ]);

            $avoidPolygons = $avoidNodes
                ->map(fn ($row) => Arr::get(json_decode($row->geojson, true), 'coordinates'))
                ->toArray();

            $avoidedNodeIds = $avoidNodes
                ->pluck('osm_id')
                ->filter()
                ->unique()
                ->values()
                ->toArray();

            $idealRouteResponse = null;

            // Ideal route with avoid_polygons if there are polygons to avoid
            if (! empty($avoidPolygons)) {
                $idealRequestBody = array_merge($baseRequestBody, [
                    'options' => [
                        'avoid_polygons' => [
                            'type' => 'MultiPolygon',
                            'coordinates' => $avoidPolygons,
                        ],
                    ],
                ]);

                $idealRouteStartedAt = microtime(true);

                Log::info('Legacy directions ideal route request started.', [
                    'avoid_polygon_count' => count($avoidPolygons),
                ]);

                $idealRouteResponse = Http::withHeaders([
                    'Authorization' => config('services.openrouteservice.api_key'),
                ])->post('https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson', $idealRequestBody);

                $idealRouteLogContext = [
                    'status' => $idealRouteResponse->status(),
                    'successful' => $idealRouteResponse->successful(),
                    'elapsed_ms' => $this->elapsedMilliseconds($idealRouteStartedAt),
                ];

                if ($idealRouteResponse->serverError()) {
                    Log::error('Legacy directions ideal route response failed.', $idealRouteLogContext);
                } elseif ($idealRouteResponse->failed()) {
                    Log::warning('Legacy directions ideal route response failed.', $idealRouteLogContext);
                } else {
                    Log::info('Legacy directions ideal route response received.', $idealRouteLogContext);
                }
            } else {
                Log::info('Legacy directions ideal route skipped.', [
                    'avoid_polygon_count' => 0,
                ]);
            }

            // Extract bounding box from the direct route
            $bounds = null;
            if ($directRouteResponse->successful() && isset($directRouteResponse->json()['bbox'])) {
                $bbox = $directRouteResponse->json()['bbox'];
                $bounds = [
                    [$bbox[0], $bbox[1]], // [min_longitude, min_latitude]
                    [$bbox[2], $bbox[3]], // [max_longitude, max_latitude]
                ];
            }

            Log::info('Legacy directions request completed.', [
                'status' => 200,
                'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
                'direct_route_status' => $directRouteResponse->status(),
                'ideal_route_status' => $idealRouteResponse?->status(),
                'avoided_node_count' => count($avoidedNodeIds),
                'has_bounds' => $bounds !== null,
            ]);

            // Return only the information needed for directions and styling on the client
            return response()->json(array_merge(
                ['direct' => $directRouteResponse->json()], // ['direct' => ['routes' => []]]
                ['ideal' => $idealRouteResponse?->json()], // ['ideal' => ['routes' => []]]
                [
                    'avoidedMarkerIds' => $avoidedNodeIds,
                    'avoidedNodeIds' => $avoidedNodeIds,
                    'bounds' => $bounds,
                ]
            ));
        } catch (Throwable $exception) {
            Log::error('Legacy directions request failed before response.', [
                'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
                'exception' => $exception,
            ]);

            throw $exception;
        }
    }

    private function elapsedMilliseconds(float $startedAt): int
    {
        return (int) round((microtime(true) - $startedAt) * 1000);
    }
}
