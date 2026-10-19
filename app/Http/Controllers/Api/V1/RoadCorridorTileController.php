<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class RoadCorridorTileController extends Controller
{
    public function __invoke(string $tile): JsonResponse
    {
        abort_unless(preg_match('/\A-?\d{1,4}_-?\d{1,4}-[a-f0-9]{64}\.jsonl\.gz\z/', $tile) === 1, 404);

        return response()->json([
            'url' => Storage::disk('road-corridors')->temporaryUrl(
                'experimental/road-corridors/20261019T043000Z-us-v1/wisconsin/tiles/'.$tile,
                now()->addMinutes(15),
            ),
        ])->header('Cache-Control', 'no-store');
    }
}
