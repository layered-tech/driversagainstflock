<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RegionalRoadCorridorRequest;
use App\Services\RegionalRoadCorridorReleases;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class RegionalRoadCorridorTileController extends Controller
{
    public function __invoke(RegionalRoadCorridorRequest $request, string $tile, RegionalRoadCorridorReleases $regions): JsonResponse
    {
        abort_unless(config('road-corridor.downloads_enabled') && config('road-corridor.regional_downloads_enabled'), 503);
        abort_unless(preg_match('/\A-?\d{1,4}_-?\d{1,4}-[a-f0-9]{64}\.jsonl\.gz\z/', $tile), 404);
        $release = $request->query('release');
        abort_unless(is_string($release), 404);
        $catalog = $regions->catalog($request->region(), $release);
        abort_unless($catalog !== null && collect($catalog['tiles'])->contains('key', 'tiles/'.$tile), 404);

        return response()->json(['url' => Storage::disk('road-corridors')->temporaryUrl(
            "experimental/road-corridors/{$release}/us/tiles/{$tile}", now()->addMinutes(15),
        )])->header('Cache-Control', 'no-store');
    }
}
