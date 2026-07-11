<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Marker;
use App\Repositories\MapRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use MatanYadaev\EloquentSpatial\Objects\Point;

class CreateMarkerController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $marker = Marker::query()->create([
            'type' => $request->get('type', 'falcon-sr'),
            'bearing' => $request->get('bearing'),
            'point' => new Point(
                $request->get('latitude'),
                $request->get('longitude')
            ),
            'user_id' => $request->user()->id,
        ]);

        return response()->json(app(MapRepository::class)->getPoints());
    }
}
