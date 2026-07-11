<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use SocialiteProviders\Manager\SocialiteWasCalled;
use SocialiteProviders\OpenStreetMap\Provider as OpenStreetMapProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        if (! $this->app->environment('production') && class_exists(\Laravel\Telescope\TelescopeServiceProvider::class)) {
            $this->app->register(\Laravel\Telescope\TelescopeServiceProvider::class);
            $this->app->register(TelescopeServiceProvider::class);
        }
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Vite::prefetch(concurrency: 3);

        Event::listen(function (SocialiteWasCalled $event) {
            $event->extendSocialite('openstreetmap', OpenStreetMapProvider::class);
        });

        Gate::before(function ($user, $ability) {
            return $user->email === 'pfeifer.christopher@gmail.com' ? true : null;
        });

        RateLimiter::for('directions', function (Request $request) {
            if ($user = $request->user('sanctum') ?? $request->user()) {
                return Limit::perDay(500)->by($user->id);
            }

            return Limit::perHour(200)->perDay(500)->by($request->ip());
        });

        RateLimiter::for('hotlist', function (Request $request) {
            if ($user = $request->user('sanctum') ?? $request->user()) {
                return Limit::perMinute(100)->by($user->id);
            }

            return Limit::perMinute(100)->perHour(300)->by($request->ip());
        });

        RateLimiter::for('speed-limits', function (Request $request) {
            if ($user = $request->user('sanctum') ?? $request->user()) {
                return Limit::perMinute(120)->by($user->id);
            }

            return Limit::perMinute(60)->by($request->ip());
        });

        RateLimiter::for('police-alerts', function (Request $request) {
            if ($user = $request->user('sanctum') ?? $request->user()) {
                return Limit::perMinute(60)->by($user->id);
            }

            return Limit::perMinute(30)->by($request->ip());
        });

        RateLimiter::for('markers', function (Request $request) {
            if ($user = $request->user('sanctum') ?? $request->user()) {
                return Limit::perMinute(120)->by($user->id);
            }

            return Limit::perMinute(45)->by($request->ip());
        });

        RateLimiter::for('searches', function (Request $request) {
            if ($user = $request->user('sanctum') ?? $request->user()) {
                return Limit::perMinute(100)->by($user->id);
            }

            return Limit::perMinute(100)->perHour(300)->by($request->ip());
        });

        RateLimiter::for('autocomplete', function (Request $request) {
            if ($user = $request->user('sanctum') ?? $request->user()) {
                return Limit::perMinute(600)->by($user->id);
            }

            return Limit::perMinute(120)->by($request->ip());
        });
    }
}
