<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Marker;
use App\Repositories\MapRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeleteMarkerController extends Controller
{
    public function __invoke(Request $request, Marker $marker): JsonResponse
    {
        $marker->delete();

        return response()->json(app(MapRepository::class)->getPoints());
    }
}
