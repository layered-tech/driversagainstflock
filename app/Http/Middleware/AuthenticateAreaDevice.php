<?php

namespace App\Http\Middleware;

use App\Models\AreaDevice;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateAreaDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        abort_unless(is_string($token) && strlen($token) === 64, 401);
        $device = AreaDevice::where('token_hash', hash('sha256', $token))->first();
        abort_unless($device, 401);
        if ($device->last_seen_at->lt(now()->subHour())) {
            $device->update(['last_seen_at' => now()]);
        }
        $request->attributes->set('area_device', $device);

        $response = $next($request);
        $response->headers->set('Cache-Control', 'private, no-store');

        return $response;
    }
}
