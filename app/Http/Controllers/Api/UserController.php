<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\UserPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function __invoke(Request $request, UserPayload $userPayload): JsonResponse
    {
        return response()->json($userPayload->for($request->user()));
    }
}
