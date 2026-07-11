<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\SpeedLimitRequest;
use App\Services\Directions\DirectionsException;
use App\Services\SpeedLimits\OpenStreetMapSpeedLimitLookup;
use Illuminate\Http\JsonResponse;

class SpeedLimitController extends Controller
{
    public function __invoke(SpeedLimitRequest $request, OpenStreetMapSpeedLimitLookup $lookup): JsonResponse
    {
        try {
            return response()->json([
                'ok' => true,
                'result' => $lookup->find($request->latitude(), $request->longitude()),
            ]);
        } catch (DirectionsException $exception) {
            return response()->json([
                'ok' => false,
                'error' => $exception->getMessage(),
            ], $exception->status);
        }
    }
}
