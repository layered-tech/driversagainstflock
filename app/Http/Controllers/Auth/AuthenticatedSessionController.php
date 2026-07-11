<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Support\MobileOAuthBroker;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class AuthenticatedSessionController extends Controller
{
    /**
     * Display the login view.
     */
    public function create(Request $request, MobileOAuthBroker $mobileOAuth): InertiaResponse|SymfonyResponse
    {
        $hasMobileRedirectIntent = $request->query->has('mobile_redirect_uri');

        $mobileOAuth->captureIntent($request);

        if ($request->user()) {
            if ($hasMobileRedirectIntent) {
                return $mobileOAuth->redirectForAuthenticatedUser(
                    $request,
                    $request->user(),
                    route('home', absolute: false),
                );
            }

            return redirect()->intended(route('home', absolute: false));
        }

        return Inertia::render('Auth/Login', [
            'canResetPassword' => Route::has('password.request'),
            'mobileLogin' => $mobileOAuth->hasIntent($request),
            'openStreetMapLoginUrl' => route('auth.openstreetmap.redirect'),
            'status' => session('status'),
        ]);
    }

    /**
     * Handle an incoming authentication request.
     */
    public function store(LoginRequest $request, MobileOAuthBroker $mobileOAuth): SymfonyResponse
    {
        $request->authenticate();

        $request->session()->regenerate();

        return $mobileOAuth->redirectForAuthenticatedUser(
            $request,
            $request->user(),
            route('home', absolute: false),
        );
    }

    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();

        $request->session()->regenerateToken();

        return redirect('/');
    }
}
