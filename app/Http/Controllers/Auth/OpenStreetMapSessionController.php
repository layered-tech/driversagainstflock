<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Client\HttpClientException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Telescope\Telescope;

class OpenStreetMapSessionController extends Controller
{
    public function redirect(Request $request): RedirectResponse
    {
        if (! config('moderation.oauth.client_id')) {
            return to_route('login')->with('osm_login_state', 'error');
        }
        $state = Str::random(64);
        $verifier = Str::random(96);
        $request->session()->put('osm_oauth', ['state' => $state, 'verifier' => $verifier, 'expires_at' => now()->addMinutes(10)->timestamp]);

        return redirect()->away(rtrim(config('moderation.oauth.url'), '/').'/oauth2/authorize?'.http_build_query([
            'client_id' => config('moderation.oauth.client_id'),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code', 'scope' => 'read_prefs', 'state' => $state,
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
        $oauth = $request->session()->pull('osm_oauth');
        if (! is_array($oauth) || ! is_string($request->query('state'))
            || ! hash_equals($oauth['state'], $request->query('state')) || $oauth['expires_at'] < now()->timestamp) {
            return to_route('login')->with('osm_login_state', 'error');
        }
        if ($request->query('error') === 'access_denied') {
            return to_route('login')->with('osm_login_state', 'denied');
        }
        if (! is_string($request->query('code')) || $request->query('code') === '') {
            return to_route('login')->with('osm_login_state', 'error');
        }
        try {
            $token = Telescope::withoutRecording(fn (): mixed => Http::asForm()->acceptJson()->connectTimeout(3)->timeout(10)
                ->post(rtrim(config('moderation.oauth.url'), '/').'/oauth2/token', [
                    'grant_type' => 'authorization_code', 'code' => $request->query('code'),
                    'client_id' => config('moderation.oauth.client_id'),
                    'client_secret' => config('moderation.oauth.client_secret'),
                    'redirect_uri' => $this->redirectUri(), 'code_verifier' => $oauth['verifier'],
                ])->throw()->json('access_token'));
            if (! is_string($token) || $token === '') {
                return to_route('login')->with('osm_login_state', 'error');
            }
            $profile = Telescope::withoutRecording(fn (): mixed => Http::withToken($token)->acceptJson()->connectTimeout(3)->timeout(10)
                ->get(rtrim(config('moderation.oauth.api_url'), '/').'/user/details.json')->throw()->json('user'));
        } catch (HttpClientException) {
            return to_route('login')->with('osm_login_state', 'error');
        }
        $uid = $profile['id'] ?? null;
        $name = $profile['display_name'] ?? null;
        if ((! is_int($uid) && ! is_string($uid)) || ! preg_match('/^[1-9][0-9]*$/D', (string) $uid)
            || ! is_string($name) || $name === '' || mb_strlen($name) > 255) {
            return to_route('login')->with('osm_login_state', 'error');
        }
        if (! in_array((string) $uid, config('moderation.approved_osm_ids', []), true)) {
            return to_route('login')->with('osm_login_state', 'unapproved');
        }
        $user = User::where('osm_uid', $uid)->first() ?? new User;
        $user->osm_uid = $uid;
        $user->name = $name;
        if (! $user->exists) {
            $user->password = Str::random(64);
        }
        $user->save();
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->put('osm_authenticated_uid', (string) $uid);

        return to_route('moderation.index');
    }
}
