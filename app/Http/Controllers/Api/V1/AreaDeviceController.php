<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AreaDevice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AreaDeviceController extends Controller
{
    public function store(): JsonResponse
    {
        $token = bin2hex(random_bytes(32));
        AreaDevice::create(['token_hash' => hash('sha256', $token), 'last_seen_at' => now()]);

        return response()->json(['token' => $token], 201)->header('Cache-Control', 'no-store');
    }

    public function update(Request $request): JsonResponse
    {
        $values = $request->validate([
            'push_token' => ['sometimes', 'nullable', 'string', 'max:255', 'regex:/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/'],
            'timezone' => ['sometimes', 'required', 'timezone:all'],
        ]);
        $device = $request->attributes->get('area_device');
        $timezoneChanged = isset($values['timezone']) && $values['timezone'] !== $device->timezone;
        $device->update($values);
        if ($timezoneChanged) {
            $device->subscriptions()->update(['next_digest_at' => null]);
        }

        return response()->json(['registered' => $device->push_token !== null]);
    }
}
