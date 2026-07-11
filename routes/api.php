<?php

use App\Http\Controllers\Api\AutocompleteSearchController;
use App\Http\Controllers\Api\ConfirmMarkerController;
use App\Http\Controllers\Api\CreateMarkerController;
use App\Http\Controllers\Api\DeleteMarkerController;
use App\Http\Controllers\Api\DirectionsController;
use App\Http\Controllers\Api\LocalityBoundaryController;
use App\Http\Controllers\Api\MarkersController;
use App\Http\Controllers\Api\MobileOAuthTokenController;
use App\Http\Controllers\Api\PlaceController;
use App\Http\Controllers\Api\RegisterController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\V1\DirectionsController as V1DirectionsController;
use App\Http\Controllers\Api\V1\PoliceAlertsController;
use App\Http\Controllers\Api\V1\SpeedLimitController;
use App\Http\Controllers\HotlistController;
use App\Models\Confirmation;
use App\Models\Marker;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;

Route::get('markers', MarkersController::class);
Route::post('register', RegisterController::class);
Route::post('oauth/mobile/token', MobileOAuthTokenController::class);

Route::post('search/autocomplete', AutocompleteSearchController::class)
    ->middleware('throttle:autocomplete');

Route::group(['middleware' => ['throttle:searches']], function (Router $route) {
    $route->post('search', SearchController::class);
    $route->get('place/{placeId}', PlaceController::class);
    $route->get('locality-boundary', LocalityBoundaryController::class);
});

Route::group(['middleware' => ['throttle:directions']], function (Router $route) {
    $route->post('directions', DirectionsController::class);
    $route->post('v1/directions', V1DirectionsController::class);
});

Route::group(['middleware' => ['throttle:hotlist']], function (Router $route) {
    $route->get('v1/hotlist', [HotlistController::class, 'json']);
});

Route::group(['middleware' => ['throttle:speed-limits']], function (Router $route) {
    $route->get('v1/speed-limit', SpeedLimitController::class);
});

Route::group(['middleware' => ['throttle:police-alerts']], function (Router $route) {
    $route->get('v1/police-alerts', PoliceAlertsController::class);
});

Route::group(['middleware' => 'auth:sanctum'], function (Router $router) {
    $router->get('user', UserController::class);

    $router->post('save', CreateMarkerController::class)->can('add', Marker::class);
    $router->post('delete/{marker}', DeleteMarkerController::class)->can('delete', Marker::class);
    $router->post('confirm/{marker}', ConfirmMarkerController::class)->can('create', Confirmation::class);
});

Route::post('/sanctum/token', function (Request $request) {
    $request->validate([
        'email' => 'required|email',
        'password' => 'required',
        'device_name' => 'required',
    ]);

    $user = User::query()->where('email', $request->email)->first();

    if (! $user || ! Hash::check($request->password, $user->password)) {
        throw ValidationException::withMessages([
            'email' => ['The provided credentials are incorrect.'],
        ]);
    }

    return $user->createToken($request->device_name)->plainTextToken;
});
