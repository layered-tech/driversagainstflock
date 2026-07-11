<?php

namespace App\Services\Directions;

use Illuminate\Support\Facades\Log;

class DirectionsRouter
{
    public function __construct(
        private readonly GeometryService $geometry,
        private readonly PoiSourceFactory $poiSourceFactory,
        private readonly OpenRouteServiceClient $openRouteService,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     * @return array{ok: bool, result: array<string, mixed>}
     */
    public function route(array $payload): array
    {
        $startedAt = microtime(true);
        $start = $this->coordinate($payload['start']);
        $waypoints = array_map(
            fn (array $coordinate): array => $this->coordinate($coordinate),
            $payload['waypoints'] ?? [],
        );
        $end = $this->coordinate($payload['end']);
        $routeControlCoordinates = [$start, ...$waypoints, $end];
        $profiles = $payload['profile'] ?? [];
        $avoidBuffer = (float) ($payload['avoid_buffer'] ?? config('directions.avoid_buffer_meters'));
        $allowEndpointAlpr = (bool) ($payload['allow_alpr_near_start_destination'] ?? true);
        $endpointBuffer = $allowEndpointAlpr ? $avoidBuffer * 2 : 0.0;
        $continueStraight = (bool) ($payload['continue_straight'] ?? true);
        $showZone = (bool) ($payload['show_zone'] ?? false);
        $distance = $this->geometry->routeDistanceMeters($routeControlCoordinates);

        Log::info('Directions router started.', [
            'distance_meters' => $distance,
            'waypoint_count' => count($waypoints),
            'profile_count' => count($profiles),
            'avoid_buffer_meters' => $avoidBuffer,
            'allow_alpr_near_start_destination' => $allowEndpointAlpr,
            'continue_straight' => $continueStraight,
            'show_zone' => $showZone,
        ]);

        if ($distance > (float) config('directions.max_distance_meters')) {
            Log::warning('Directions router rejected over-distance route.', [
                'distance_meters' => $distance,
                'max_distance_meters' => (float) config('directions.max_distance_meters'),
                'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
            ]);

            throw DirectionsException::badRequest('Directions are too far apart.');
        }

        $searchDistance = max(
            $avoidBuffer,
            $distance * (float) config('directions.search_distance_multiplier')
        );
        $source = $this->poiSourceFactory->make();
        $maxAttempts = (int) config('directions.expansion_attempts');

        Log::info('Directions POI source selected.', [
            'source' => get_debug_type($source),
            'max_attempts' => $maxAttempts + 1,
            'initial_search_distance_meters' => $searchDistance,
        ]);

        $directRouteStartedAt = microtime(true);
        Log::info('Directions direct route request started.');

        $directRoute = $this->openRouteService->route($routeControlCoordinates, [
            'type' => 'MultiPolygon',
            'coordinates' => [],
        ], $continueStraight);

        Log::info('Directions direct route loaded.', [
            'coordinate_count' => count($directRoute['coordinates']),
            'distance_meters' => $directRoute['distance'],
            'duration_seconds' => $directRoute['duration'],
            'elapsed_ms' => $this->elapsedMilliseconds($directRouteStartedAt),
        ]);

        $fastestRouteNodeCount = 0;
        $lastIdealRoute = null;
        $lastBounds = null;
        $lastSearchDistance = $searchDistance;
        $lastZone = ['type' => 'MultiPolygon', 'coordinates' => []];
        $completedAttempts = 0;

        for ($attempt = 0; $attempt <= $maxAttempts; $attempt++) {
            $attemptStartedAt = microtime(true);
            $bounds = $this->geometry->searchBoundsForCoordinates($routeControlCoordinates, $searchDistance);
            $lastBounds = $bounds;
            $lastSearchDistance = $searchDistance;

            Log::info('Directions route attempt started.', [
                'attempt' => $attempt + 1,
                'max_attempts' => $maxAttempts + 1,
                'search_distance_meters' => $searchDistance,
                'bounds' => $bounds,
            ]);

            $poiLookupStartedAt = microtime(true);
            $pois = $source->find($bounds, $profiles);

            Log::info('Directions POI lookup completed.', [
                'attempt' => $attempt + 1,
                'source' => get_debug_type($source),
                'poi_count' => count($pois),
                'elapsed_ms' => $this->elapsedMilliseconds($poiLookupStartedAt),
            ]);

            $routeCountStartedAt = microtime(true);
            $fastestRouteNodeCount = $source instanceof RouteAwarePoiSource
                ? $source->countAlongRoute($directRoute['coordinates'], $avoidBuffer, $profiles)
                : $this->geometry->countPoisAlongRoute(
                    $pois,
                    $directRoute['coordinates'],
                    $avoidBuffer
                );

            Log::info('Directions route intersection count completed.', [
                'attempt' => $attempt + 1,
                'node_count' => $fastestRouteNodeCount,
                'elapsed_ms' => $this->elapsedMilliseconds($routeCountStartedAt),
            ]);

            $zoneStartedAt = microtime(true);
            $zone = $this->geometry->exclusionZone(
                $pois,
                $avoidBuffer,
                (float) config('directions.cone_angle_degrees'),
                (int) config('directions.cone_segments')
            );

            if ($allowEndpointAlpr) {
                $zone = $this->geometry->clearWaypointBuffers($zone, $routeControlCoordinates, $endpointBuffer);
            }

            Log::info('Directions exclusion zone built.', [
                'attempt' => $attempt + 1,
                'polygon_count' => count($zone['coordinates'] ?? []),
                'allow_alpr_near_start_destination' => $allowEndpointAlpr,
                'elapsed_ms' => $this->elapsedMilliseconds($zoneStartedAt),
            ]);

            $route = ($zone['coordinates'] ?? []) === []
                ? $directRoute
                : null;

            if ($route === null) {
                $idealRouteStartedAt = microtime(true);

                Log::info('Directions ideal route request started.', [
                    'attempt' => $attempt + 1,
                    'avoid_polygon_count' => count($zone['coordinates'] ?? []),
                ]);

                $route = $this->openRouteService->route($routeControlCoordinates, $zone, $continueStraight);

                Log::info('Directions ideal route loaded.', [
                    'attempt' => $attempt + 1,
                    'coordinate_count' => count($route['coordinates']),
                    'distance_meters' => $route['distance'],
                    'duration_seconds' => $route['duration'],
                    'elapsed_ms' => $this->elapsedMilliseconds($idealRouteStartedAt),
                ]);
            } else {
                Log::info('Directions ideal route skipped because exclusion zone is empty.', [
                    'attempt' => $attempt + 1,
                ]);
            }

            $lastIdealRoute = $route;
            $lastZone = $zone;
            $completedAttempts = $attempt + 1;
            $routeInsideBounds = $this->geometry->routeInsideBounds($route['coordinates'], $bounds);

            Log::info('Directions route attempt completed.', [
                'attempt' => $attempt + 1,
                'route_inside_bounds' => $routeInsideBounds,
                'elapsed_ms' => $this->elapsedMilliseconds($attemptStartedAt),
            ]);

            if ($routeInsideBounds) {
                break;
            }

            $searchDistance *= (float) config('directions.expansion_multiplier');

            Log::info('Directions search distance expanded.', [
                'attempt' => $attempt + 1,
                'next_search_distance_meters' => $searchDistance,
            ]);
        }

        Log::info('Directions router completed.', [
            'attempts' => $completedAttempts,
            'fastest_route_node_count' => $fastestRouteNodeCount,
            'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
        ]);

        return [
            'ok' => true,
            'result' => [
                'route' => $lastIdealRoute ?? $directRoute,
                'routes' => [
                    'direct' => array_merge($directRoute, [
                        'fastest_route_node_count' => $fastestRouteNodeCount,
                        'node_count' => $fastestRouteNodeCount,
                    ]),
                    'ideal' => $lastIdealRoute ?? $directRoute,
                ],
                'fastest_route_node_count' => $fastestRouteNodeCount,
                'exclusion_zone' => $showZone ? [
                    'type' => 'Feature',
                    'geometry' => $lastZone,
                    'properties' => null,
                ] : null,
                'debug_geometry' => $showZone
                    ? $this->debugGeometry(
                        $routeControlCoordinates,
                        $lastBounds,
                        $lastSearchDistance,
                        $avoidBuffer,
                        $endpointBuffer,
                        $allowEndpointAlpr,
                        $lastZone,
                    )
                    : null,
            ],
        ];
    }

    /**
     * @param  array<int, array{longitude: float, latitude: float}>  $routeControlCoordinates
     * @param  array{west: float, south: float, east: float, north: float}|null  $bounds
     * @param  array{type: string, coordinates: array<int, mixed>}  $zone
     * @return array{type: string, features: array<int, array<string, mixed>>}
     */
    private function debugGeometry(
        array $routeControlCoordinates,
        ?array $bounds,
        float $searchDistance,
        float $avoidBuffer,
        float $endpointBuffer,
        bool $allowEndpointAlpr,
        array $zone,
    ): array {
        $features = [
            [
                'type' => 'Feature',
                'geometry' => [
                    'type' => 'LineString',
                    'coordinates' => array_map(
                        fn (array $coordinate): array => [$coordinate['longitude'], $coordinate['latitude']],
                        $routeControlCoordinates,
                    ),
                ],
                'properties' => [
                    'debugRole' => 'destination_line',
                ],
            ],
        ];

        if ($bounds !== null) {
            $features[] = [
                'type' => 'Feature',
                'geometry' => [
                    'type' => 'Polygon',
                    'coordinates' => [[
                        [$bounds['west'], $bounds['south']],
                        [$bounds['east'], $bounds['south']],
                        [$bounds['east'], $bounds['north']],
                        [$bounds['west'], $bounds['north']],
                        [$bounds['west'], $bounds['south']],
                    ]],
                ],
                'properties' => [
                    'avoidBufferMeters' => $avoidBuffer,
                    'debugRole' => 'search_zone',
                    'searchDistanceMeters' => $searchDistance,
                ],
            ];
        }

        $endpointBuffers = $allowEndpointAlpr
            ? $this->geometry->waypointBufferZone($routeControlCoordinates, $endpointBuffer)
            : ['type' => 'MultiPolygon', 'coordinates' => []];

        $features[] = [
            'type' => 'Feature',
            'geometry' => $endpointBuffers,
            'properties' => [
                'allowAlprNearStartDestination' => $allowEndpointAlpr,
                'avoidBufferMeters' => $avoidBuffer,
                'debugRole' => 'endpoint_buffers',
                'endpointBufferMeters' => $endpointBuffer,
                'polygonCount' => count($endpointBuffers['coordinates'] ?? []),
            ],
        ];

        $features[] = [
            'type' => 'Feature',
            'geometry' => $zone,
            'properties' => [
                'avoidBufferMeters' => $avoidBuffer,
                'debugRole' => 'avoid_polygons',
                'polygonCount' => count($zone['coordinates'] ?? []),
            ],
        ];

        return [
            'type' => 'FeatureCollection',
            'features' => $features,
        ];
    }

    private function elapsedMilliseconds(float $startedAt): int
    {
        return (int) round((microtime(true) - $startedAt) * 1000);
    }

    /**
     * @param  array<string, mixed>  $coordinate
     * @return array{longitude: float, latitude: float}
     */
    private function coordinate(array $coordinate): array
    {
        return [
            'longitude' => (float) $coordinate['longitude'],
            'latitude' => (float) $coordinate['latitude'],
        ];
    }
}
