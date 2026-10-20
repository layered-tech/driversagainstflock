<?php

namespace App\Services\Areas;

use App\Models\AreaSubscription;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class AreaAlerts
{
    public function __construct(private AreaChanges $changes) {}

    public function process(int $id, ?int $throughId = null): void
    {
        DB::transaction(function () use ($id, $throughId): void {
            $area = AreaSubscription::with('device')->whereKey($id)->lockForUpdate()->first();
            if (! $area) {
                return;
            }
            $latest = $throughId ?? $this->changes->latestVersionId();
            if ($area->alert_mode === 'off' || ! $area->device->push_token) {
                $area->update(['last_processed_version_id' => $latest, 'pending_added' => 0, 'pending_removed' => 0, 'next_digest_at' => null]);

                return;
            }
            $records = $this->changes->query($area)->where('id', '>', $area->last_processed_version_id)->where('id', '<=', $latest)->orderBy('id')->limit(200)->get();
            foreach ($records as $record) {
                if (! $area->{'notify_'.$record->kind}) {
                    continue;
                }
                if ($area->alert_mode === 'instant') {
                    $change = $this->changes->normalize($record);
                    $this->delivery($area, 'change:'.$record->id, [
                        'title' => ($record->kind === 'added' ? 'New camera in ' : 'Camera removed in ').$area->name,
                        'body' => 'An ALPR reader was '.$record->kind.' at '.$change['street'].'. Tap to see it on the map.',
                        'data' => ['area_id' => $area->id, 'change_id' => $change['id']],
                    ]);
                } else {
                    $area->{'pending_'.$record->kind}++;
                }
            }
            $area->last_processed_version_id = $records->count() === 200 ? $records->last()->id : $latest;
            if (in_array($area->alert_mode, ['daily', 'weekly'], true)) {
                $area->next_digest_at ??= $this->nextDigest($area, CarbonImmutable::parse($area->updated_at));
                if ($area->next_digest_at->lte(now()) && $records->count() < 200) {
                    if ($area->pending_added + $area->pending_removed > 0) {
                        $this->delivery($area, 'digest:'.$area->next_digest_at->getTimestamp(), [
                            'title' => ($area->alert_mode === 'weekly' ? 'Your week in ' : 'Your day in ').$area->name,
                            'body' => "{$area->pending_added} cameras added, {$area->pending_removed} removed. Tap to see the changes.",
                            'data' => ['area_id' => $area->id],
                        ]);
                    }
                    $area->pending_added = 0;
                    $area->pending_removed = 0;
                    $area->next_digest_at = $this->nextDigest($area, CarbonImmutable::now());
                }
            }
            $area->save();
        });
    }

    /** @param array<string, mixed> $payload */
    private function delivery(AreaSubscription $area, string $key, array $payload): void
    {
        $area->deliveries()->firstOrCreate(['delivery_key' => $area->preference_version.':'.$key], [
            'preference_version' => $area->preference_version, 'payload' => $payload,
        ]);
    }

    public function nextDigest(AreaSubscription $area, CarbonImmutable $after): CarbonImmutable
    {
        $local = $after->setTimezone($area->device->timezone);
        [$hour, $minute] = array_map('intval', explode(':', $area->digest_time));
        $next = $local->setTime($hour, $minute);
        if ($area->alert_mode === 'weekly') {
            $next = $next->addDays((8 - $next->dayOfWeekIso) % 7);
            if ($next->lte($local)) {
                $next = $next->addWeek();
            }
        } elseif ($next->lte($local)) {
            $next = $next->addDay();
        }

        return $next->utc();
    }
}
