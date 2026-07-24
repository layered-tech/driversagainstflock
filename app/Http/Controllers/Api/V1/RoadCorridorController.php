<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RoadCorridorRequest;
use App\Services\Directions\DirectionsException;
use App\Services\Roads\OpenStreetMapRoadGraphLookup;
use Illuminate\Http\JsonResponse;

class RoadCorridorController extends Controller
{
    public function __invoke(
        RoadCorridorRequest $request,
        OpenStreetMapRoadGraphLookup $lookup,
    ): JsonResponse {
        try {
            return response()->json([
                'ok' => true,
                'result' => [
                    'ways' => $lookup->find(
                        $request->latitude(),
                        $request->longitude(),
                        $request->radiusMeters(),
                    ),
                ],
            ]);
        } catch (DirectionsException $exception) {
            return response()->json([
                'ok' => false,
                'error' => $exception->getMessage(),
            ], $exception->status);
        }
    }
}
