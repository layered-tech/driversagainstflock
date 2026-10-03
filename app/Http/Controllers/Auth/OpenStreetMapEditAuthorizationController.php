<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Client\HttpClientException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Telescope\Telescope;

class OpenStreetMapEditAuthorizationController extends Controller
{
    public function redirect(Request $request): RedirectResponse
    {
        $node = $request->validate(['node' => ['required', 'integer', 'min:1']])['node'];
        if (! config('moderation.oauth.client_id')) {
            return to_route('moderation.nodes.show', $node)->with('osm_edit_error', 'OpenStreetMap editing authorization is not configured.');
        }
        $state = Str::random(64);
        $verifier = Str::random(96);
        $request->session()->forget('osm_edit_token');
        $request->session()->put('osm_edit_oauth', [
            'state' => $state, 'verifier' => $verifier, 'node' => $node,
            'uid' => (string) $request->user()->osm_uid, 'expires_at' => now()->addMinutes(10)->timestamp,
        ]);

        return redirect()->away(rtrim(config('moderation.oauth.url'), '/').'/oauth2/authorize?'.http_build_query([
            'client_id' => config('moderation.oauth.client_id'), 'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code', 'scope' => 'read_prefs write_api', 'state' => $state,
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
            'code_challenge_method' => 'S256',
        ], '', '&', PHP_QUERY_RFC3986));
    }

    private function redirectUri(): string
    {
        return config('moderation.oauth.redirect_uri') ?: route('login.osm.callback');
    }

    public function callback(Request $request): RedirectResponse
    {
        $oauth = $request->session()->pull('osm_edit_oauth');
        $node = is_array($oauth) ? ($oauth['node'] ?? null) : null;
        $failed = fn (): RedirectResponse => ($node ? to_route('moderation.nodes.show', $node) : to_route('moderation.index'))
            ->with('osm_edit_error', 'OpenStreetMap editing was not authorized. Please try again using your moderator account.');
        if (! is_array($oauth) || ! is_string($request->query('state'))
            || ! hash_equals($oauth['state'], $request->query('state')) || $oauth['expires_at'] < now()->timestamp
            || $oauth['uid'] !== (string) $request->user()->osm_uid
            || ! is_string($request->query('code')) || $request->query('code') === '') {
            return $failed();
        }
        try {
            $authorization = Telescope::withoutRecording(function () use ($request, $oauth): ?array {
                $token = Http::asForm()->acceptJson()->connectTimeout(3)->timeout(10)
                    ->post(rtrim(config('moderation.oauth.url'), '/').'/oauth2/token', [
                        'grant_type' => 'authorization_code', 'code' => $request->query('code'),
                        'client_id' => config('moderation.oauth.client_id'), 'client_secret' => config('moderation.oauth.client_secret'),
                        'redirect_uri' => $this->redirectUri(), 'code_verifier' => $oauth['verifier'],
                    ])->throw()->json();
                if (! is_string($token['access_token'] ?? null) || $token['access_token'] === '') {
                    return null;
                }
                $http = Http::withToken($token['access_token'])->acceptJson()->connectTimeout(3)->timeout(10);
                $base = rtrim(config('moderation.oauth.api_url'), '/');
                $uid = $http->get($base.'/user/details.json')->throw()->json('user.id');
                $permissions = $http->get($base.'/permissions.json')->throw()->json('permissions');
                if ((string) $uid !== $oauth['uid'] || ! is_array($permissions) || ! in_array('allow_write_api', $permissions, true)) {
                    return null;
                }

                return ['token' => Crypt::encryptString($token['access_token']), 'uid' => $oauth['uid'],
                    'expires_at' => now()->addSeconds(min(7200, max(1, (int) ($token['expires_in'] ?? 7200))))->timestamp];
            });
        } catch (HttpClientException) {
            return $failed();
        }
        if ($authorization === null) {
            return $failed();
        }
        $request->session()->put('osm_edit_token', $authorization);

        return to_route('moderation.nodes.show', $node);
    }
}
