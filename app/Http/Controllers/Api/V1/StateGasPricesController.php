<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\FuelPrices\AaaStateGasPriceService;
use Illuminate\Http\JsonResponse;
use Throwable;

class StateGasPricesController extends Controller
{
    public function __invoke(AaaStateGasPriceService $gasPrices): JsonResponse
    {
        try {
            $snapshot = $gasPrices->current();
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'ok' => false,
                'error' => 'State gas prices are temporarily unavailable.',
            ], 503);
        }

        return response()
            ->json([
                'ok' => true,
                'data' => $snapshot,
            ])
            ->header('Cache-Control', 'public, max-age=21600, stale-while-revalidate=583200');
    }
}
