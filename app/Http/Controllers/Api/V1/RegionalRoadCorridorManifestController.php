<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RegionalRoadCorridorRequest;
use App\Services\RegionalRoadCorridorReleases;
use Illuminate\Http\JsonResponse;

class RegionalRoadCorridorManifestController extends Controller
{
    public function __invoke(RegionalRoadCorridorRequest $request, RegionalRoadCorridorReleases $regions): JsonResponse
    {
        if (! config('road-corridor.downloads_enabled') || ! config('road-corridor.regional_downloads_enabled')) {
            return response()->json(['enabled' => false])->header('Cache-Control', 'no-store');
        }
        abort_if($regions->current() === null, 503, 'National road corridor catalog unavailable.');
        $catalog = $regions->catalog($request->region());
        if ($catalog === null) {
            return response()->json(['enabled' => false])->header('Cache-Control', 'no-store');
        }
        $response = response()->json(['enabled' => true, 'regional_enabled' => true, 'catalog' => $catalog])->header('Cache-Control', 'no-store');
        $response->setEtag(hash('sha256', $response->getContent()));
        $response->isNotModified($request);

        return $response;
    }
}
