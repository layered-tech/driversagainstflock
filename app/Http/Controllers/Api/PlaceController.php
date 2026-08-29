<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class PlaceController extends Controller
{
    private const FIELD_MASK = [
        'id',
        'name',
        'displayName',
        'formattedAddress',
        'shortFormattedAddress',
        'addressComponents',
        'location',
        'viewport',
        'types',
        'primaryType',
        'primaryTypeDisplayName',
        'businessStatus',
        'googleMapsUri',
        'plusCode',
        'utcOffsetMinutes',
    ];

    public function __invoke(Request $request, string $placeId): JsonResponse
    {
        $sessionToken = $request->validate([
            'sessionToken' => ['nullable', 'uuid'],
        ])['sessionToken'] ?? null;

        return response()->json(
            Http::withHeaders([
                'X-Goog-Api-Key' => env('GOOGLE_PLACES_KEY'),
                'X-Goog-FieldMask' => implode(',', self::FIELD_MASK),
            ])->get(
                'https://places.googleapis.com/v1/places/'.$placeId,
                array_filter([
                    'sessionToken' => $sessionToken,
                ])
            )->json()
        );
    }
}
