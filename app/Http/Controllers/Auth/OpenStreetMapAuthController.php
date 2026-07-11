<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Models\User;
use App\Support\MobileOAuthBroker;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Laravel\Socialite\Facades\Socialite;
use Symfony\Component\HttpFoundation\Response;

class OpenStreetMapAuthController extends Controller
{
    private const PROVIDER = 'openstreetmap';

    private const PENDING_SESSION_KEY = 'openstreetmap_oauth.pending_user';

    public function redirect(Request $request, MobileOAuthBroker $mobileOAuth)
    {
        $mobileOAuth->captureIntent($request);

        return Socialite::driver(self::PROVIDER)->scopes(['openid'])->redirect();
    }

    public function callback(Request $request, MobileOAuthBroker $mobileOAuth): Response
    {
        $openStreetMapUser = Socialite::driver(self::PROVIDER)->user();

        $account = SocialAccount::query()
            ->where('provider', self::PROVIDER)
            ->where('provider_user_id', (string) $openStreetMapUser->getId())
            ->first();

        if ($account) {
            $this->updateSocialAccount($account, $openStreetMapUser);

            Auth::login($account->user);
            $request->session()->regenerate();

            return $mobileOAuth->redirectForAuthenticatedUser(
                $request,
                $account->user,
                route('home', absolute: false),
            );
        }

        $request->session()->put(self::PENDING_SESSION_KEY, [
            'provider_user_id' => (string) $openStreetMapUser->getId(),
            'nickname' => $openStreetMapUser->getNickname(),
            'name' => $openStreetMapUser->getName() ?: $openStreetMapUser->getNickname(),
            'avatar' => $openStreetMapUser->getAvatar(),
            'token' => $openStreetMapUser->token ?? null,
            'refresh_token' => $openStreetMapUser->refreshToken ?? null,
            'expires_at' => isset($openStreetMapUser->expiresIn)
                ? now()->addSeconds($openStreetMapUser->expiresIn)
                : null,
        ]);

        return redirect()->route('auth.openstreetmap.register');
    }

    public function create(Request $request)
    {
        $pendingUser = $this->pendingUser($request);

        if (! $pendingUser) {
            return redirect()->route('login');
        }

        return Inertia::render('Auth/CompleteOpenStreetMapRegistration', [
            'openStreetMapUser' => [
                'nickname' => $pendingUser['nickname'] ?? null,
                'name' => $pendingUser['name'] ?? null,
                'avatar' => $pendingUser['avatar'] ?? null,
            ],
        ]);
    }

    public function store(Request $request, MobileOAuthBroker $mobileOAuth): Response
    {
        $pendingUser = $this->pendingUser($request);

        if (! $pendingUser) {
            return redirect()->route('login');
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', Rule::unique(User::class)],
        ]);

        $user = DB::transaction(function () use ($validated, $pendingUser) {
            $user = User::create([
                'name' => $validated['name'],
                'email' => $validated['email'],
                'password' => Str::random(64),
            ]);

            SocialAccount::create([
                'user_id' => $user->id,
                'provider' => self::PROVIDER,
                'provider_user_id' => $pendingUser['provider_user_id'],
                'nickname' => $pendingUser['nickname'] ?? null,
                'name' => $pendingUser['name'] ?? null,
                'avatar' => $pendingUser['avatar'] ?? null,
                'token' => $pendingUser['token'] ?? null,
                'refresh_token' => $pendingUser['refresh_token'] ?? null,
                'expires_at' => $pendingUser['expires_at'] ?? null,
            ]);

            return $user;
        });

        event(new Registered($user));

        $request->session()->forget(self::PENDING_SESSION_KEY);

        Auth::login($user);
        $request->session()->regenerate();

        return $mobileOAuth->redirectForAuthenticatedUser(
            $request,
            $user,
            route('home', absolute: false),
        );
    }

    private function pendingUser(Request $request): ?array
    {
        $pendingUser = $request->session()->get(self::PENDING_SESSION_KEY);

        return is_array($pendingUser) && ! empty($pendingUser['provider_user_id'])
            ? $pendingUser
            : null;
    }

    private function updateSocialAccount(SocialAccount $account, mixed $openStreetMapUser): void
    {
        $account->forceFill([
            'nickname' => $openStreetMapUser->getNickname(),
            'name' => $openStreetMapUser->getName() ?: $openStreetMapUser->getNickname(),
            'avatar' => $openStreetMapUser->getAvatar(),
            'token' => $openStreetMapUser->token ?? $account->token,
            'refresh_token' => $openStreetMapUser->refreshToken ?? $account->refresh_token,
            'expires_at' => isset($openStreetMapUser->expiresIn)
                ? now()->addSeconds($openStreetMapUser->expiresIn)
                : $account->expires_at,
        ])->save();
    }
}
