<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\PoliceAlertsRequest;
use App\Services\Directions\DirectionsException;
use App\Services\PoliceAlerts\WazePoliceAlertLookup;
use Illuminate\Http\JsonResponse;

class PoliceAlertsController extends Controller
{
    public function __invoke(PoliceAlertsRequest $request, WazePoliceAlertLookup $lookup): JsonResponse
    {
        try {
            return response()->json([
                'ok' => true,
                'result' => [
                    'alerts' => $lookup->find($request->latitude(), $request->longitude()),
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
