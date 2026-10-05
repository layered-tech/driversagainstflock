<?php

namespace App\Http\Controllers;

use App\Http\Requests\ModerationMessageRequest;
use App\Http\Requests\ModerationNodeEditRequest;
use App\Models\ModerationActivity;
use App\Services\OpenStreetMap\ModerationNodeEditor;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Laravel\Telescope\Telescope;

class ModerationNodeController extends Controller
{
    public function show(Request $request, int $node, ModerationNodeEditor $editor): JsonResponse
    {
        $input = $request->validate(['flag_id' => ['required', 'integer', 'min:1'], 'adjust' => ['sometimes', 'boolean']]);
        $flag = $editor->flag($node, (int) $input['flag_id']);
        $options = $editor->options($flag, $request->boolean('adjust'));
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

    private function token(Request $request, string $key = 'osm_edit_token'): ?string
    {
        $authorization = $request->session()->get($key);
        if (! is_array($authorization) || ($authorization['uid'] ?? null) !== (string) $request->user()->osm_uid
            || ($authorization['expires_at'] ?? 0) < now()->timestamp || ! is_string($authorization['token'] ?? null)) {
            return null;
        }

        try {
            return Crypt::decryptString($authorization['token']);
        } catch (DecryptException) {
            $request->session()->forget($key);

            return null;
        }
    }

    public function messageState(Request $request, int $node, ModerationNodeEditor $editor): JsonResponse
    {
        $token = $this->token($request, 'osm_message_token');
        if ($token === null) {
            return response()->json(['authorized' => false]);
        }
        try {
            $current = $editor->current($node, $token);
        } catch (ConnectionException) {
            throw ValidationException::withMessages(['message' => 'OpenStreetMap is unavailable. Please try again.']);
        }

        return response()->json(['authorized' => true, 'node' => $current]);
    }

    public function message(ModerationMessageRequest $request, int $node, ModerationNodeEditor $editor): JsonResponse
    {
        $token = $this->token($request, 'osm_message_token');
        if ($token === null) {
            throw ValidationException::withMessages(['message' => 'Authorize OpenStreetMap messaging before sending.']);
        }
        $input = $request->validated();

        return Telescope::withoutRecording(function () use ($request, $node, $editor, $token, $input): JsonResponse {
            try {
                $current = $editor->current($node, $token);
                if ((int) ($current['uid'] ?? 0) !== (int) $input['recipient_id'] || (int) $current['version'] !== (int) $input['version']) {
                    throw ValidationException::withMessages(['message' => 'This node changed on OpenStreetMap. Reopen the message to review its current editor.']);
                }
                $response = Http::withToken($token)->acceptJson()->asForm()->connectTimeout(3)->timeout(15)
                    ->post(rtrim(config('moderation.oauth.api_url'), '/').'/user/messages.json', [
                        'recipient_id' => $input['recipient_id'], 'title' => $input['subject'],
                        'body' => $input['body'],
                    ]);
            } catch (ConnectionException) {
                throw ValidationException::withMessages(['message' => 'The message response could not be confirmed. Check your OSM outbox before retrying.']);
            }
            if (! $response->successful()) {
                throw ValidationException::withMessages(['message' => match ($response->status()) {
                    401, 403 => 'Authorize messaging again and check your OpenStreetMap account.',
                    429, 427 => 'OpenStreetMap is limiting messages. Please try again later.',
                    default => 'The message response could not be confirmed. Check your OSM outbox before retrying.',
                }]);
            }
            $messageId = $response->json('message.id');
            if (! is_numeric($messageId) || (int) $messageId < 1) {
                throw ValidationException::withMessages(['message' => 'The message response could not be confirmed. Check your OSM outbox before retrying.']);
            }
            ModerationActivity::create([
                'user_id' => $request->user()->id, 'actor' => $request->user()->name,
                'action' => 'node.osm_message', 'subject_type' => 'node', 'subject_id' => $node,
                'details' => ['message_id' => (int) $messageId, 'recipient_id' => (int) $input['recipient_id']],
            ]);

            return response()->json(['message_id' => (int) $messageId]);
        });
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
