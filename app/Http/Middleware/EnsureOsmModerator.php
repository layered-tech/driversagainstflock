<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureOsmModerator
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user && $user->osm_uid
            && (string) $request->session()->get('osm_authenticated_uid') === (string) $user->osm_uid
            && in_array((string) $user->osm_uid, config('moderation.approved_osm_ids', []), true), 403);

        return $next($request);
    }
}
