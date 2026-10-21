<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RegionalRoadCorridorRequest;
use App\Services\RegionalRoadCorridorReleases;
use App\Services\RoadCorridorReleases;
use Illuminate\Http\JsonResponse;

class RegionalRoadCorridorManifestController extends Controller
{
    public function __invoke(RegionalRoadCorridorRequest $request, RegionalRoadCorridorReleases $regions, RoadCorridorReleases $legacy): JsonResponse
    {
        if (! config('road-corridor.downloads_enabled')) {
            return response()->json(['enabled' => false])->header('Cache-Control', 'no-store');
        }
        $catalog = config('road-corridor.regional_downloads_enabled') ? $regions->catalog($request->region()) : null;
        $catalog ??= $legacy->catalog($legacy->current());
        $response = response()->json(['enabled' => true, 'regional_enabled' => (bool) config('road-corridor.regional_downloads_enabled'), 'catalog' => $catalog])->header('Cache-Control', 'no-store');
        $response->setEtag(hash('sha256', $response->getContent()));
        $response->isNotModified($request);

        return $response;
    }
}
