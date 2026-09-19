<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreAlprPresenceReportRequest;
use App\Services\OpenStreetMap\AlprPresenceReports;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;

class AlprPresenceReportController extends Controller
{
    public function __invoke(StoreAlprPresenceReportRequest $request, AlprPresenceReports $reports): JsonResponse
    {
        try {
            $report = $reports->accept($request->validated(), $request->user('sanctum')?->id);
        } catch (QueryException $exception) {
            report($exception);

            return response()->json(['message' => 'The report could not be received. Please retry.'], 503)->header('Retry-After', '60');
        }

        return response()->json(['id' => $report->id, 'status' => 'received'], $report->wasRecentlyCreated ? 201 : 200);
    }
}
