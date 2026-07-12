<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ElectronicHorizonAlprRequest;
use App\Services\Directions\DirectionsException;
use App\Services\ElectronicHorizon\ElectronicHorizonAlprLookup;
use Illuminate\Http\JsonResponse;

class ElectronicHorizonAlprController extends Controller
{
    public function __invoke(
        ElectronicHorizonAlprRequest $request,
        ElectronicHorizonAlprLookup $lookup,
    ): JsonResponse {
        try {
            return response()->json([
                'ok' => true,
                'result' => [
                    'nodes' => $lookup->find($request->coordinates()),
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
