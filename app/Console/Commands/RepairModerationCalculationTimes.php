<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class RepairModerationCalculationTimes extends Command
{
    protected $signature = 'moderation:repair-calculation-times {--from-timezone= : Former PostgreSQL session timezone} {--apply : Apply the correction instead of previewing it}';

    protected $description = 'Repair editor calculation timestamps written under a non-UTC PostgreSQL session';

    public function handle(): int
    {
        $timezone = $this->option('from-timezone');
        if (! is_string($timezone) || ! in_array($timezone, timezone_identifiers_list(), true) || $timezone === 'UTC') {
            $this->error('Supply the former session timezone, for example --from-timezone=America/Chicago.');

            return self::FAILURE;
        }

        return DB::transaction(function () use ($timezone): int {
            DB::statement('LOCK TABLE moderation_editor_summaries IN EXCLUSIVE MODE');
            $disk = Storage::disk('local');
            $path = 'moderation-calculation-time-repair.json';
            $snapshot = $disk->exists($path)
                ? json_decode($disk->get($path), true, flags: JSON_THROW_ON_ERROR)
                : ['timezone' => $timezone, 'rows' => DB::table('moderation_editor_summaries')->whereNotNull('calculated_at')->get(['id', 'calculated_at'])->toArray()];

            if ($snapshot['timezone'] !== $timezone) {
                $this->error('The saved repair snapshot uses a different timezone.');

                return self::FAILURE;
            }

            if (! $this->option('apply')) {
                $this->info('Snapshot contains '.count($snapshot['rows']).' calculation timestamps. Use --apply to repair matching values.');

                return self::SUCCESS;
            }

            if (! $disk->exists($path) && ! $disk->put($path, json_encode($snapshot, JSON_THROW_ON_ERROR))) {
                $this->error('Could not save the original timestamps. No values were changed.');

                return self::FAILURE;
            }

            $count = DB::update(<<<'SQL'
                UPDATE moderation_editor_summaries AS summaries
                SET calculated_at = (original.calculated_at AT TIME ZONE ?) AT TIME ZONE 'UTC'
                FROM jsonb_to_recordset(?::jsonb) AS original(id bigint, calculated_at timestamptz)
                WHERE summaries.id = original.id AND summaries.calculated_at = original.calculated_at
                AND summaries.calculated_at IS DISTINCT FROM ((original.calculated_at AT TIME ZONE ?) AT TIME ZONE 'UTC')
                SQL, [$timezone, json_encode($snapshot['rows'], JSON_THROW_ON_ERROR), $timezone]);
            $this->info("Corrected {$count} calculation timestamps. Original values are saved in {$path}.");

            return self::SUCCESS;
        });
    }
}
