<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\RoadCorridorReleases;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class RoadCorridorTileController extends Controller
{
    public function __invoke(Request $request, string $tile, RoadCorridorReleases $releases): JsonResponse
    {
        abort_unless(preg_match('/\A-?\d{1,4}_-?\d{1,4}-[a-f0-9]{64}\.jsonl\.gz\z/', $tile) === 1, 404);

        abort_unless(config('road-corridor.downloads_enabled'), 503);
        $release = $request->query->has('release') ? $request->query('release') : config('road-corridor.bundled_release');
        abort_unless(is_string($release) && preg_match('/\A[A-Za-z0-9][A-Za-z0-9_-]{0,79}\z/', $release), 404);
        $published = $releases->current();
        abort_unless(in_array($release, [
            $published['active_release'],
            $published['previous_release'],
            config('road-corridor.bundled_release'),
        ], true), 404);

        return response()->json([
            'url' => Storage::disk('road-corridors')->temporaryUrl(
                "experimental/road-corridors/{$release}/wisconsin/tiles/".$tile,
                now()->addMinutes(15),
            ),
        ])->header('Cache-Control', 'no-store');
    }
}
