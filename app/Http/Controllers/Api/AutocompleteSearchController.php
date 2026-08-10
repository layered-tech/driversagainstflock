<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class AutocompleteSearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $sessionToken = $request->validate([
            'sessionToken' => ['required', 'uuid'],
        ])['sessionToken'];

        return response()->json(
            Http::withHeaders([
                'X-Goog-Api-Key' => env('GOOGLE_PLACES_KEY'),
                'X-Goog-FieldMask' => implode(',', [
                    'suggestions.placePrediction.placeId',
                    'suggestions.placePrediction.text.text',
                    'suggestions.placePrediction.text.matches.startOffset',
                    'suggestions.placePrediction.text.matches.endOffset',
                    'suggestions.placePrediction.structuredFormat.mainText.text',
                    'suggestions.placePrediction.structuredFormat.secondaryText.text',
                    'suggestions.placePrediction.distanceMeters',
                ]),
            ])->post(
                'https://places.googleapis.com/v1/places:autocomplete',
                array_merge($request->only('input', 'locationBias', 'origin'), [
                    'sessionToken' => $sessionToken,
                ])
            )->json()
        );
    }
}
