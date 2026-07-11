<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\MobileOAuthBroker;
use App\Support\UserPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class MobileOAuthTokenController extends Controller
{
    public function __invoke(Request $request, MobileOAuthBroker $mobileOAuth, UserPayload $userPayload): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string'],
            'device_name' => ['required', 'string', 'max:255'],
        ]);

        $user = $mobileOAuth->consumeCode($validated['code']);

        if (! $user) {
            throw ValidationException::withMessages([
                'code' => ['The login code is invalid or has expired.'],
            ]);
        }

        return response()->json(array_merge([
            'token' => $user->createToken($validated['device_name'])->plainTextToken,
        ], $userPayload->for($user)));
    }
}
