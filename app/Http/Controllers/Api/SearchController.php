<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class SearchController extends Controller
{
    use ValidatesRequests;

    /**
     * @throws ValidationException
     * @throws ConnectionException
     */
    public function __invoke(Request $request): JsonResponse
    {
        $this->validate($request, [
            'textQuery' => 'required|string',
        ]);

        return response()->json(
            Http::withHeader('X-Goog-Api-Key', env('GOOGLE_PLACES_KEY'))->post(
                'https://places.googleapis.com/v1/places:searchText?fields=places.id,places.name,places.location,places.formattedAddress,places.displayName,places.types,places.primaryType',
                $request->only(['textQuery', 'locationBias'])
            )->json()
        );
    }
}
