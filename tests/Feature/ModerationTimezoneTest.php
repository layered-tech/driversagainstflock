<?php

use App\Models\ModerationEditorSummary;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

test('PostgreSQL stores UTC model dates as the same instant', function () {
    $this->travelTo(now()->setDate(2026, 9, 10)->setTime(2, 16, 45));
    $summary = ModerationEditorSummary::create(['osm_uid' => 123, 'calculated_at' => now()]);

    expect(DB::selectOne("SELECT current_setting('TimeZone') AS timezone")->timezone)->toBe('UTC')
        ->and($summary->fresh()->calculated_at->getTimestamp())->toBe(now()->getTimestamp());
});

test('calculation repair preserves source dates and cannot shift timestamps twice', function () {
    Storage::fake('local');
    $summary = ModerationEditorSummary::create(['osm_uid' => 123]);
    DB::table('moderation_editor_summaries')->where('id', $summary->id)->update([
        'calculated_at' => '2026-09-10 02:16:45-05',
        'first_active' => '2020-01-01 00:00:00+00',
    ]);
    $arguments = ['--from-timezone' => 'America/Chicago'];
    $this->artisan('moderation:repair-calculation-times', $arguments)->assertSuccessful();
    expect($summary->fresh()->calculated_at->utc()->format('H:i:s'))->toBe('07:16:45');
    $this->artisan('moderation:repair-calculation-times', [...$arguments, '--apply' => true])->assertSuccessful();
    expect($summary->fresh()->calculated_at->utc()->format('Y-m-d H:i:s'))->toBe('2026-09-10 02:16:45')
        ->and($summary->fresh()->first_active->utc()->format('Y-m-d H:i:s'))->toBe('2020-01-01 00:00:00');
    $this->artisan('moderation:repair-calculation-times', [...$arguments, '--apply' => true])->expectsOutputToContain('Corrected 0')->assertSuccessful();
    Storage::disk('local')->assertExists('moderation-calculation-time-repair.json');
});
