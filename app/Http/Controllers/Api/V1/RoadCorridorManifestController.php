<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\RoadCorridorReleases;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoadCorridorManifestController extends Controller
{
    public function __invoke(Request $request, RoadCorridorReleases $releases): JsonResponse
    {
        if (! config('road-corridor.downloads_enabled')) {
            return response()->json(['enabled' => false])->header('Cache-Control', 'no-store');
        }

        $catalog = $releases->catalog($releases->current());

        $response = response()->json([
            'enabled' => true,
            'catalog' => ['schema_version' => 1, ...$catalog],
        ])->header('Cache-Control', 'no-store');
        $response->setEtag(hash('sha256', $response->getContent()));
        $response->isNotModified($request);

        return $response;
    }
}
