<?php

use App\Models\ModerationActivity;
use App\Models\ModerationEditorStatus;
use App\Models\ModerationEditorSummary;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\CreatesModerationSource;

uses(CreatesModerationSource::class);

beforeEach(function (): void {
    $this->createModerationSource();
    $this->moderator();
    config(['inertia.ssr.enabled' => false]);
});

test('moderators assign and clear persistent editor statuses with an audit record', function () {
    $this->from('/moderation/editors')->put('/moderation/editors/456/status', ['status' => 'Trusted'])->assertRedirect('/moderation/editors');
    $status = ModerationEditorStatus::sole();
    expect($status->osm_uid)->toBe(456)->and($status->status)->toBe('Trusted')->and($status->assigned_by)->toBe(auth()->id());
    $this->put('/moderation/editors/456/status', ['status' => 'Watch'])->assertRedirect();
    expect(ModerationEditorStatus::sole()->id)->toBe($status->id)->and(ModerationEditorStatus::sole()->status)->toBe('Watch');
    $this->put('/moderation/editors/456/status', ['status' => null])->assertRedirect();
    expect(ModerationEditorStatus::count())->toBe(0)
        ->and(ModerationActivity::latest('id')->first()->details)->toMatchArray(['previous' => 'Watch', 'status' => null]);
});

test('editor statuses reject invalid values and unapproved users', function () {
    $this->put('/moderation/editors/456/status', ['status' => 'Auto flagged'])->assertSessionHasErrors('status');
    $this->actingAs(User::factory()->create(['osm_uid' => 999]))
        ->put('/moderation/editors/456/status', ['status' => 'New'])->assertForbidden();
    expect(ModerationEditorStatus::count())->toBe(0);
});

test('editor status filtering combines selected statuses and excludes unassigned editors', function () {
    foreach ([456, 457, 458] as $uid) {
        ModerationEditorSummary::create(['osm_uid' => $uid, 'name' => 'Editor '.$uid, 'calculated_at' => now()]);
    }
    ModerationEditorStatus::factory()->create(['osm_uid' => 456, 'status' => 'Trusted', 'assigned_by' => auth()->id()]);
    ModerationEditorStatus::factory()->create(['osm_uid' => 457, 'status' => 'Watch', 'assigned_by' => auth()->id()]);
    $this->get('/moderation/editors?editor_statuses[]=Trusted&editor_statuses[]=Watch')->assertInertia(fn (Assert $page) => $page
        ->component('Moderation/Editors')->has('records.data', 2)
        ->where('records.data.0.status', 'Watch')->where('records.data.1.status', 'Trusted'));
    $this->get('/moderation/editors?sort=status&order=asc&editor_statuses[]=Trusted&editor_statuses[]=Watch')->assertInertia(fn (Assert $page) => $page
        ->where('records.data.0.status', 'Trusted')->where('records.data.1.status', 'Watch'));
    $this->get('/moderation/editors?editor_statuses[]=New')->assertInertia(fn (Assert $page) => $page->has('records.data', 0));
    $this->get('/moderation/editors')->assertInertia(fn (Assert $page) => $page->has('records.data', 3)->where('records.data.0.status', null));
});

test('assignments survive editor summary deletion and rebuilding', function () {
    $this->put('/moderation/editors/456/status', ['status' => 'Neutral'])->assertRedirect();
    $summary = ModerationEditorSummary::create(['osm_uid' => 456, 'calculated_at' => now()]);
    $summary->delete();
    ModerationEditorSummary::create(['osm_uid' => 456, 'calculated_at' => now()]);
    $this->get('/moderation/editors?editor_statuses[]=Neutral')->assertInertia(fn (Assert $page) => $page
        ->has('records.data', 1)->where('records.data.0.status', 'Neutral'));
});
