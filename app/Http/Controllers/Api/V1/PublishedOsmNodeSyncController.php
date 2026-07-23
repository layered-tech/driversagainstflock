<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\PublishedOsmNodeSyncException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\SyncPublishedOsmNodesRequest;
use App\Services\OpenStreetMap\PublishedOsmNodeSynchronizer;
use Illuminate\Http\JsonResponse;

class PublishedOsmNodeSyncController extends Controller
{
    public function __invoke(
        SyncPublishedOsmNodesRequest $request,
        PublishedOsmNodeSynchronizer $synchronizer,
    ): JsonResponse {
        try {
            $result = $synchronizer->sync(
                $request->changesetId(),
                $request->nodes(),
            );
        } catch (PublishedOsmNodeSyncException $exception) {
            report($exception);

            return response()->json([
                'ok' => false,
                'error' => $exception->getMessage(),
            ], $exception->status);
        }

        return response()->json([
            'ok' => true,
            'result' => $result,
        ]);
    }
}
