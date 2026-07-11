<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Marker;
use App\Repositories\MapRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ConfirmMarkerController extends Controller
{
    public function __invoke(Request $request, Marker $marker): JsonResponse
    {
        $marker->confirmations()->create(['user_id' => $request->user()->id]);

        return response()->json(array_merge([
            'marker' => app(MapRepository::class)->transformMarker(
                $marker->load(app(MapRepository::class)->getEagerLoadedRelationships())
            ),
        ], app(MapRepository::class)->getPoints()));
    }
}
