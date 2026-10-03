<?php

namespace App\Http\Controllers;

use App\Http\Requests\ModerationNodeEditRequest;
use App\Services\OpenStreetMap\ModerationNodeEditor;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\ValidationException;

class ModerationNodeController extends Controller
{
    public function show(Request $request, int $node, ModerationNodeEditor $editor): JsonResponse
    {
        $input = $request->validate(['flag_id' => ['required', 'integer', 'min:1']]);
        $flag = $editor->flag($node, (int) $input['flag_id']);
        $options = $editor->options($flag);
        $token = $this->token($request);
        if ($token === null) {
            return response()->json(['authorized' => false, ...$options]);
        }
        try {
            return response()->json(['authorized' => true, 'node' => $editor->current($node, $token), ...$options]);
        } catch (ConnectionException) {
            throw ValidationException::withMessages(['edit' => 'OpenStreetMap is unavailable. Please try again.']);
        }
    }

    private function token(Request $request): ?string
    {
        $authorization = $request->session()->get('osm_edit_token');
        if (! is_array($authorization) || ($authorization['uid'] ?? null) !== (string) $request->user()->osm_uid
            || ($authorization['expires_at'] ?? 0) < now()->timestamp || ! is_string($authorization['token'] ?? null)) {
            return null;
        }

        try {
            return Crypt::decryptString($authorization['token']);
        } catch (DecryptException) {
            $request->session()->forget('osm_edit_token');

            return null;
        }
    }

    public function store(ModerationNodeEditRequest $request, int $node, ModerationNodeEditor $editor): JsonResponse
    {
        $token = $this->token($request);
        if ($token === null) {
            throw ValidationException::withMessages(['edit' => 'Authorize OpenStreetMap editing before saving.']);
        }
        $flag = $editor->flag($node, (int) $request->validated('flag_id'));
        try {
            $result = $editor->save($node, $token, $request->validated(), $flag, $request->user()->id, $request->user()->name);
        } catch (ConnectionException) {
            throw ValidationException::withMessages(['edit' => 'The OpenStreetMap response was interrupted. Check node history before retrying.']);
        }

        return response()->json($result);
    }
}
