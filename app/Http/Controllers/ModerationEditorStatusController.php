<?php

namespace App\Http\Controllers;

use App\Http\Requests\ModerationEditorStatusRequest;
use App\Models\ModerationActivity;
use App\Models\ModerationEditorStatus;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;

class ModerationEditorStatusController extends Controller
{
    public function update(ModerationEditorStatusRequest $request, int $uid): RedirectResponse
    {
        DB::transaction(function () use ($request, $uid): void {
            $status = $request->validated('status');
            $previous = ModerationEditorStatus::where('osm_uid', $uid)->value('status');
            if ($status === $previous) {
                return;
            }
            if ($status === null) {
                ModerationEditorStatus::where('osm_uid', $uid)->delete();
            } else {
                ModerationEditorStatus::updateOrCreate(['osm_uid' => $uid], [
                    'status' => $status, 'assigned_by' => $request->user()->id,
                ]);
            }
            ModerationActivity::create([
                'user_id' => $request->user()->id, 'actor' => $request->user()->name,
                'action' => 'editor.status_changed', 'subject_type' => 'editor', 'subject_id' => $uid,
                'details' => ['previous' => $previous, 'status' => $status],
            ]);
        });

        return back();
    }
}
