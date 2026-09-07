<?php

namespace App\Http\Controllers;

use App\Http\Requests\ModerationReviewRequest;
use App\Models\ModerationActivity;
use App\Models\ModerationReview;
use App\Services\OpenStreetMap\ModerationReader;
use Illuminate\Database\QueryException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ModerationReviewController extends Controller
{
    public function changeset(ModerationReviewRequest $request, int $changeset, ModerationReader $reader): RedirectResponse
    {
        abort_if($request->validated('status') === 'Dismissed', 422);

        return $this->save($request, 'changeset', $changeset, $reader);
    }

    private function save(ModerationReviewRequest $request, string $type, int $id, ModerationReader $reader): RedirectResponse
    {
        try {
            $record = $reader->query()->getConnection()->transaction(fn () => $reader->query()->fromSub($type === 'node' ? $reader->nodes() : $reader->changesets(), 'record')->where('id', $id)->first());
        } catch (QueryException $exception) {
            report($exception);
            throw ValidationException::withMessages(['review' => 'OpenStreetMap data is unavailable. The review was not saved. Please try again.']);
        }
        abort_unless($record, 404);
        if (! hash_equals($record->revision, $request->validated('revision'))) {
            throw ValidationException::withMessages(['review' => 'This record changed after you opened it. Refresh and review the latest version.']);
        }
        DB::transaction(function () use ($request, $type, $id, $record): void {
            $review = ModerationReview::firstOrCreate(['subject_type' => $type, 'subject_id' => $id], ['revision' => $record->revision, 'status' => $record->status]);
            $review = ModerationReview::whereKey($review->id)->lockForUpdate()->firstOrFail();
            if ($review->status === $request->validated('status') && $review->revision === $record->revision) {
                return;
            }
            $review->update(['revision' => $record->revision, 'status' => $request->validated('status'), 'user_id' => $request->user()->id]);
            ModerationActivity::create(['user_id' => $request->user()->id, 'actor' => $request->user()->name, 'action' => $type === 'node' ? 'node.dismissed' : 'changeset.reviewed', 'subject_type' => $type, 'subject_id' => $id, 'details' => ['from' => $record->status, 'to' => $review->status, 'revision' => $record->revision]]);
        });

        return back();
    }

    public function node(ModerationReviewRequest $request, int $node, ModerationReader $reader): RedirectResponse
    {
        abort_unless($request->validated('status') === 'Dismissed', 422);

        return $this->save($request, 'node', $node, $reader);
    }
}
