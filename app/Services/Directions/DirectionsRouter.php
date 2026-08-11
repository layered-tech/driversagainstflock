<?php

namespace App\Services\Directions;

use Illuminate\Support\Facades\Log;

class DirectionsRouter
{
    public function __construct(
        private readonly GeometryService $geometry,
        private readonly PoiSourceFactory $poiSourceFactory,
        private readonly OpenRouteServiceClient $openRouteService,
        private readonly GraphHopperClient $graphHopper,
        private readonly GraphHopperCircuitBreaker $graphHopperCircuitBreaker,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     * @return array{ok: bool, result: array<string, mixed>}
     */
    public function route(array $payload): array
    {
        if (config('directions.provider') !== $this->graphHopper->name()) {
            return $this->calculate($payload, $this->openRouteService);
        }

        if (! $this->graphHopperCircuitBreaker->allowsRequest()) {
            Log::warning('GraphHopper circuit breaker is open; using OpenRouteService.');

            return $this->calculate($payload, $this->openRouteService);
        }

        try {
            $result = $this->calculate($payload, $this->graphHopper);
            $this->graphHopperCircuitBreaker->recordSuccess();

            return $result;
        } catch (GraphHopperException $exception) {
            return $this->fallBackToOpenRouteService($payload, $exception);
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{ok: bool, result: array<string, mixed>}
     */
    private function calculate(array $payload, DirectionsProvider $provider): array
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
        $scorecardCameraRange = (float) config('directions.scorecard_camera_range_meters');
        $allowEndpointAlpr = (bool) ($payload['allow_alpr_near_start_destination'] ?? true);
        $endpointBuffer = $allowEndpointAlpr ? $avoidBuffer * 2 : 0.0;
        $continueStraight = (bool) ($payload['continue_straight'] ?? true);
        $showZone = (bool) ($payload['show_zone'] ?? false);
        $distance = $this->geometry->routeDistanceMeters($routeControlCoordinates);

        Log::info('Directions router started.', [
            'provider' => $provider->name(),
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

        $searchDistance = $avoidBuffer;
        $source = $this->poiSourceFactory->make();
        $maxAttempts = (int) config('directions.expansion_attempts');

        Log::info('Directions POI source selected.', [
            'source' => get_debug_type($source),
            'max_attempts' => $maxAttempts + 1,
            'initial_search_distance_meters' => $searchDistance,
        ]);

        $directRouteStartedAt = microtime(true);
        Log::info('Directions direct route request started.');

        $directRoute = $provider->route($routeControlCoordinates, [
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
        $currentRoute = $directRoute;
        $lastIdealRoute = $directRoute;
        $lastBounds = null;
        $lastPois = [];
        $lastSearchDistance = $searchDistance;
        $lastZone = ['type' => 'MultiPolygon', 'coordinates' => []];
        $completedAttempts = 0;
        $avoidedPois = [];
        $candidatePois = [];

        for ($attempt = 0; $attempt <= $maxAttempts; $attempt++) {
            $attemptStartedAt = microtime(true);
            $bounds = $this->geometry->searchBoundsForCoordinates(
                $this->routeCoordinates($currentRoute['coordinates']),
                $searchDistance,
            );
            $lastBounds = $bounds;
            $lastSearchDistance = $searchDistance;

            Log::info('Directions route attempt started.', [
                'attempt' => $attempt + 1,
                'max_attempts' => $maxAttempts + 1,
                'search_distance_meters' => $searchDistance,
            ]);

            $poiLookupStartedAt = microtime(true);
            $sourcePois = $source instanceof RouteAwarePoiSource
                ? $source->findAlongRoute(
                    $currentRoute['coordinates'],
                    max($avoidBuffer, $scorecardCameraRange),
                    $profiles,
                )
                : $source->find($bounds, $profiles);
            $routePois = $this->geometry->poisAlongRoute(
                $sourcePois,
                $currentRoute['coordinates'],
                $avoidBuffer,
            );

            foreach ($sourcePois as $poi) {
                $candidatePois[$this->poiKey($poi)] = $poi;
            }

            if ($attempt === 0) {
                $fastestRouteNodeCount = count($routePois);
            }

            $newPois = [];

            foreach ($routePois as $poi) {
                $key = $this->poiKey($poi);

                if (isset($avoidedPois[$key])) {
                    continue;
                }

                $avoidedPois[$key] = $poi;
                $newPois[] = $poi;
            }

            $lastPois = array_values($candidatePois);

            Log::info('Directions POI lookup completed.', [
                'attempt' => $attempt + 1,
                'source' => get_debug_type($source),
                'route_poi_count' => count($routePois),
                'new_poi_count' => count($newPois),
                'accumulated_poi_count' => count($avoidedPois),
                'elapsed_ms' => $this->elapsedMilliseconds($poiLookupStartedAt),
            ]);

            Log::info('Directions route intersection count completed.', [
                'attempt' => $attempt + 1,
                'node_count' => count($routePois),
                'new_node_count' => count($newPois),
            ]);

            $completedAttempts = $attempt + 1;

            if ($newPois === []) {
                $lastIdealRoute = $currentRoute;

                Log::info('Directions route attempt completed without new POIs.', [
                    'attempt' => $attempt + 1,
                    'accumulated_poi_count' => count($avoidedPois),
                    'elapsed_ms' => $this->elapsedMilliseconds($attemptStartedAt),
                ]);

                break;
            }

            $zoneStartedAt = microtime(true);
            $zone = $this->geometry->exclusionZone(
                array_values($avoidedPois),
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
                'accumulated_poi_count' => count($avoidedPois),
                'allow_alpr_near_start_destination' => $allowEndpointAlpr,
                'elapsed_ms' => $this->elapsedMilliseconds($zoneStartedAt),
            ]);

            $lastZone = $zone;

            if (($zone['coordinates'] ?? []) === []) {
                $lastIdealRoute = $currentRoute;

                Log::info('Directions ideal route skipped because exclusion zone is empty.', [
                    'attempt' => $attempt + 1,
                ]);

                break;
            }

            $idealRouteStartedAt = microtime(true);

            Log::info('Directions ideal route request started.', [
                'attempt' => $attempt + 1,
                'avoid_polygon_count' => count($zone['coordinates'] ?? []),
            ]);

            $currentRoute = $provider->route($routeControlCoordinates, $zone, $continueStraight);

            Log::info('Directions ideal route loaded.', [
                'attempt' => $attempt + 1,
                'coordinate_count' => count($currentRoute['coordinates']),
                'distance_meters' => $currentRoute['distance'],
                'duration_seconds' => $currentRoute['duration'],
                'elapsed_ms' => $this->elapsedMilliseconds($idealRouteStartedAt),
            ]);

            $lastIdealRoute = $currentRoute;

            Log::info('Directions route attempt completed.', [
                'attempt' => $attempt + 1,
                'accumulated_poi_count' => count($avoidedPois),
                'elapsed_ms' => $this->elapsedMilliseconds($attemptStartedAt),
            ]);
        }

        Log::info('Directions router completed.', [
            'attempts' => $completedAttempts,
            'fastest_route_node_count' => $fastestRouteNodeCount,
            'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
        ]);

        $resolvedIdealRoute = $lastIdealRoute ?? $directRoute;
        $directCandidates = $this->geometry->routeCameraCandidates(
            $lastPois,
            $directRoute['coordinates'],
            $scorecardCameraRange,
            (float) config('directions.cone_angle_degrees'),
            (int) config('directions.cone_segments'),
        );
        $idealCandidates = $this->geometry->routeCameraCandidates(
            $lastPois,
            $resolvedIdealRoute['coordinates'],
            $scorecardCameraRange,
            (float) config('directions.cone_angle_degrees'),
            (int) config('directions.cone_segments'),
        );
        $cameraCoverageComplete = $lastBounds !== null
            && $this->geometry->routeInsideBounds($directRoute['coordinates'], $lastBounds)
            && $this->geometry->routeInsideBounds($resolvedIdealRoute['coordinates'], $lastBounds);

        return [
            'ok' => true,
            'result' => [
                'route' => $resolvedIdealRoute,
                'routes' => [
                    'direct' => array_merge($directRoute, [
                        'camera_candidates' => $directCandidates,
                        'camera_coverage_complete' => $cameraCoverageComplete,
                        'fastest_route_node_count' => count($directCandidates),
                        'node_count' => count($directCandidates),
                        'scored_node_count' => count(array_filter(
                            $directCandidates,
                            fn (array $candidate): bool => $candidate['direction_known'],
                        )),
                    ]),
                    'ideal' => array_merge($resolvedIdealRoute, [
                        'camera_candidates' => $idealCandidates,
                        'camera_coverage_complete' => $cameraCoverageComplete,
                        'node_count' => count($idealCandidates),
                        'scored_node_count' => count(array_filter(
                            $idealCandidates,
                            fn (array $candidate): bool => $candidate['direction_known'],
                        )),
                    ]),
                ],
                'fastest_route_node_count' => count($directCandidates),
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
     * @param  array<string, mixed>  $payload
     * @return array{ok: bool, result: array<string, mixed>}
     */
    private function fallBackToOpenRouteService(array $payload, GraphHopperException $exception): array
    {
        $this->graphHopperCircuitBreaker->recordFailure();

        Log::warning('GraphHopper calculation failed; restarting with OpenRouteService.', [
            'exception_type' => $exception::class,
        ]);

        return $this->calculate($payload, $this->openRouteService);
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

    private function poiKey(PointOfInterest $poi): string
    {
        if ($poi->id !== null) {
            return 'id:'.(string) $poi->id;
        }

        return sprintf('coordinate:%0.7f,%0.7f', $poi->longitude, $poi->latitude);
    }

    /**
     * @param  array<int, array<int, float>>  $coordinates
     * @return array<int, array{longitude: float, latitude: float}>
     */
    private function routeCoordinates(array $coordinates): array
    {
        return array_values(array_map(
            fn (array $coordinate): array => [
                'longitude' => (float) $coordinate[0],
                'latitude' => (float) $coordinate[1],
            ],
            array_filter($coordinates, fn (array $coordinate): bool => count($coordinate) >= 2),
        ));
    }
}
