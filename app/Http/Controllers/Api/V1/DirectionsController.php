<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\DirectionsRequest;
use App\Services\Directions\DirectionsException;
use App\Services\Directions\DirectionsRouter;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class DirectionsController extends Controller
{
    public function __invoke(DirectionsRequest $request, DirectionsRouter $router): JsonResponse
    {
        $startedAt = microtime(true);
        $payload = $request->directionsPayload();

        Log::withContext([
            'directions_request_id' => (string) Str::uuid(),
            'directions_endpoint' => 'api.v1.directions',
        ]);

        Log::info('Directions request started.', [
            'start' => $payload['start'],
            'end' => $payload['end'],
            'waypoint_count' => count($payload['waypoints'] ?? []),
            'profile_count' => count($payload['profile'] ?? []),
            'avoid_buffer_meters' => $payload['avoid_buffer'] ?? null,
            'allow_alpr_near_start_destination' => $payload['allow_alpr_near_start_destination'] ?? null,
            'continue_straight' => $payload['continue_straight'] ?? null,
            'show_zone' => $payload['show_zone'] ?? null,
        ]);

        try {
            $result = $router->route($payload);

            Log::info('Directions request completed.', [
                'status' => 200,
                'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
                'route_distance_meters' => data_get($result, 'result.route.distance'),
                'route_duration_seconds' => data_get($result, 'result.route.duration'),
                'fastest_route_node_count' => data_get($result, 'result.fastest_route_node_count'),
            ]);

            return response()->json($result);
        } catch (DirectionsException $exception) {
            $context = [
                'status' => $exception->status,
                'elapsed_ms' => $this->elapsedMilliseconds($startedAt),
                'error' => $exception->getMessage(),
            ];

            if ($exception->status >= 500) {
                Log::error('Directions request returning upstream failure.', $context);
            } else {
                Log::warning('Directions request rejected.', $context);
            }

            return response()->json([
                'ok' => false,
                'error' => $exception->getMessage(),
            ], $exception->status);
        }
    }

    private function elapsedMilliseconds(float $startedAt): int
    {
        return (int) round((microtime(true) - $startedAt) * 1000);
    }
}
