<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

class MobileOAuthBroker
{
    private const SESSION_KEY = 'mobile_oauth';

    public function captureIntent(Request $request): void
    {
        if (! $request->query->has('mobile_redirect_uri')) {
            return;
        }

        $validator = Validator::make($request->query(), [
            'mobile_redirect_uri' => ['required', 'string', 'max:2048'],
            'mobile_state' => ['nullable', 'string', 'max:255'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $redirectUri = $request->query('mobile_redirect_uri');

            if (is_string($redirectUri) && ! $this->redirectUriIsAllowed($redirectUri)) {
                $validator->errors()->add('mobile_redirect_uri', 'The mobile redirect URI is not allowed.');
            }
        });

        $validated = $validator->validate();

        $request->session()->put(self::SESSION_KEY, [
            'redirect_uri' => $validated['mobile_redirect_uri'],
            'state' => $validated['mobile_state'] ?? null,
        ]);
    }

    public function hasIntent(Request $request): bool
    {
        return $request->session()->has(self::SESSION_KEY);
    }

    public function redirectForAuthenticatedUser(Request $request, User $user, string $fallback): Response
    {
        $mobileOAuth = $request->session()->pull(self::SESSION_KEY);

        if (! is_array($mobileOAuth) || empty($mobileOAuth['redirect_uri'])) {
            return redirect()->intended($fallback);
        }

        $redirectUri = $mobileOAuth['redirect_uri'];

        if (! is_string($redirectUri) || ! $this->redirectUriIsAllowed($redirectUri)) {
            throw ValidationException::withMessages([
                'mobile_redirect_uri' => ['The mobile redirect URI is not allowed.'],
            ]);
        }

        $code = Str::random(72);

        Cache::put($this->cacheKey($code), [
            'user_id' => $user->id,
        ], now()->addMinutes($this->codeExpiresMinutes()));

        return Inertia::location($this->appendQuery($redirectUri, [
            'code' => $code,
            'state' => $mobileOAuth['state'] ?? null,
        ]));
    }

    public function consumeCode(string $code): ?User
    {
        $payload = Cache::pull($this->cacheKey($code));

        if (! is_array($payload) || empty($payload['user_id'])) {
            return null;
        }

        return User::query()->find($payload['user_id']);
    }

    public function cacheKey(string $code): string
    {
        return 'mobile-oauth-code:'.hash('sha256', $code);
    }

    private function redirectUriIsAllowed(string $redirectUri): bool
    {
        $scheme = parse_url($redirectUri, PHP_URL_SCHEME);

        if (! is_string($scheme)) {
            return false;
        }

        return in_array($scheme, $this->allowedRedirectSchemes(), true);
    }

    private function allowedRedirectSchemes(): array
    {
        return array_values(array_filter(
            config('services.mobile_auth.allowed_redirect_schemes', ['driversagainstflock']),
            fn ($scheme) => is_string($scheme) && $scheme !== '',
        ));
    }

    private function codeExpiresMinutes(): int
    {
        return max(1, (int) config('services.mobile_auth.code_expires_minutes', 5));
    }

    private function appendQuery(string $uri, array $parameters): string
    {
        $parameters = array_filter($parameters, fn ($value) => $value !== null && $value !== '');

        if ($parameters === []) {
            return $uri;
        }

        return $uri.(str_contains($uri, '?') ? '&' : '?').Arr::query($parameters);
    }
}
