<?php

namespace App\Console\Commands;

use App\Models\CurrentOsmNode;
use App\Models\OsmNode;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Throwable;

class VerifyOsmCutoverCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:verify-osm-cutover
        {--node=* : OSM node IDs to compare between the legacy and reader sources}
        {--samples=5 : Number of evenly distributed legacy rows to compare when no node IDs are supplied}
        {--maximum-count-difference=0 : Maximum allowed absolute row-count difference}
        {--maximum-source-age-minutes= : Maximum allowed reader source age in minutes}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Verify OSM reader count, freshness, and representative row parity';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $maximumCountDifference = $this->nonNegativeIntegerOption('maximum-count-difference');
        $maximumSourceAgeMinutes = $this->maximumSourceAgeMinutes();
        $nodeIds = $this->requestedNodeIds();
        $sampleCount = $this->positiveIntegerOption('samples', maximum: 20);

        if (
            $maximumCountDifference === null
            || $maximumSourceAgeMinutes === null
            || $nodeIds === null
            || $sampleCount === null
        ) {
            return self::FAILURE;
        }

        try {
            $legacyCount = $this->legacyQuery()->count();
            $readerCount = CurrentOsmNode::readerQuery()->count();

            if ($legacyCount === 0 || $readerCount === 0) {
                $this->components->error('Both the legacy source and OSM reader must contain current ALPR rows.');

                return self::FAILURE;
            }

            $sourceTimestamp = $this->readerSourceTimestamp();

            if ($sourceTimestamp === null) {
                $this->components->error('The OSM reader did not publish a source timestamp.');

                return self::FAILURE;
            }

            $sourceAgeMinutes = (int) floor($sourceTimestamp->diffInSeconds(now()) / 60);
            $countDifference = abs($readerCount - $legacyCount);

            $this->table(
                ['Source', 'Current ALPR rows'],
                [
                    ['Legacy application database', number_format($legacyCount)],
                    ['OSM reader database', number_format($readerCount)],
                    ['Absolute difference', number_format($countDifference)],
                ],
            );
            $this->line(sprintf(
                'OSM reader source age: %d minute(s) at %s.',
                $sourceAgeMinutes,
                $sourceTimestamp->toIso8601String(),
            ));

            $failed = false;

            if ($countDifference > $maximumCountDifference) {
                $this->components->error(sprintf(
                    'The row-count difference exceeds the approved maximum of %d.',
                    $maximumCountDifference,
                ));
                $failed = true;
            }

            if ($sourceAgeMinutes > $maximumSourceAgeMinutes) {
                $this->components->error(sprintf(
                    'The OSM reader source age exceeds the approved maximum of %d minute(s).',
                    $maximumSourceAgeMinutes,
                ));
                $failed = true;
            }

            if ($nodeIds === []) {
                $nodeIds = $this->sampleNodeIds($legacyCount, $sampleCount);
            }

            $rowMismatches = $this->compareNodes($nodeIds);

            if ($rowMismatches !== []) {
                foreach ($rowMismatches as $mismatch) {
                    $this->components->error($mismatch);
                }

                $failed = true;
            } else {
                $this->components->info(sprintf(
                    'Representative row parity passed for %d node(s).',
                    count($nodeIds),
                ));
            }

            if ($failed) {
                return self::FAILURE;
            }

            $this->components->info('OSM consumer cutover gates passed.');

            return self::SUCCESS;
        } catch (Throwable $exception) {
            report($exception);
            $this->components->error('OSM consumer cutover verification could not complete.');

            return self::FAILURE;
        }
    }

    private function nonNegativeIntegerOption(string $name): ?int
    {
        $value = $this->option($name);

        if (! is_scalar($value) || ! ctype_digit((string) $value)) {
            $this->components->error("--{$name} must be a non-negative integer.");

            return null;
        }

        return (int) $value;
    }

    private function maximumSourceAgeMinutes(): ?int
    {
        $configuredMaximum = (int) config('osm.reader.maximum_source_age_minutes', 10);
        $option = $this->option('maximum-source-age-minutes');

        if ($option === null || $option === '') {
            return $configuredMaximum > 0 ? $configuredMaximum : null;
        }

        return $this->positiveIntegerOption('maximum-source-age-minutes');
    }

    private function positiveIntegerOption(string $name, ?int $maximum = null): ?int
    {
        $value = $this->option($name);

        if (
            ! is_scalar($value)
            || ! ctype_digit((string) $value)
            || (int) $value < 1
            || ($maximum !== null && (int) $value > $maximum)
        ) {
            $maximumMessage = $maximum === null ? '' : " no greater than {$maximum}";
            $this->components->error("--{$name} must be a positive integer{$maximumMessage}.");

            return null;
        }

        return (int) $value;
    }

    /**
     * @return array<int, int>|null
     */
    private function requestedNodeIds(): ?array
    {
        $nodeIds = [];

        foreach ((array) $this->option('node') as $nodeId) {
            if (! is_scalar($nodeId) || ! ctype_digit((string) $nodeId) || (int) $nodeId < 1) {
                $this->components->error('Every --node value must be a positive integer.');

                return null;
            }

            $nodeIds[] = (int) $nodeId;
        }

        return array_values(array_unique($nodeIds));
    }

    /**
     * @return Builder<OsmNode>
     */
    private function legacyQuery(): Builder
    {
        return OsmNode::query()
            ->where('surveillance_type', 'ALPR')
            ->whereRaw("tags ->> 'surveillance:type' = 'ALPR'");
    }

    private function readerSourceTimestamp(): ?Carbon
    {
        $sourceTimestamp = CurrentOsmNode::readerQuery()->max('source_timestamp');

        return is_string($sourceTimestamp) && $sourceTimestamp !== ''
            ? Carbon::parse($sourceTimestamp)
            : null;
    }

    /**
     * @return array<int, int>
     */
    private function sampleNodeIds(int $legacyCount, int $requestedSampleCount): array
    {
        $sampleCount = min($requestedSampleCount, $legacyCount);
        $offsets = $sampleCount === 1
            ? [0]
            : array_map(
                fn (int $index): int => (int) round(($legacyCount - 1) * $index / ($sampleCount - 1)),
                range(0, $sampleCount - 1),
            );
        $nodeIds = [];

        foreach (array_unique($offsets) as $offset) {
            $nodeId = $this->legacyQuery()
                ->orderBy('osm_id')
                ->offset($offset)
                ->value('osm_id');

            if (is_numeric($nodeId)) {
                $nodeIds[] = (int) $nodeId;
            }
        }

        return $nodeIds;
    }

    /**
     * @param  array<int, int>  $nodeIds
     * @return array<int, string>
     */
    private function compareNodes(array $nodeIds): array
    {
        $mismatches = [];

        foreach ($nodeIds as $nodeId) {
            $legacyNode = $this->legacyQuery()->where('osm_id', $nodeId)->first();
            $readerNode = CurrentOsmNode::readerQuery()->where('osm_id', $nodeId)->first();

            if (! $legacyNode instanceof OsmNode) {
                $mismatches[] = "Node {$nodeId} is missing from the legacy source.";

                continue;
            }

            if (! $readerNode instanceof CurrentOsmNode) {
                $mismatches[] = "Node {$nodeId} is missing from the OSM reader.";

                continue;
            }

            $legacy = $this->comparableValues($legacyNode);
            $reader = $this->comparableValues($readerNode);
            $differentFields = array_keys(array_diff_assoc($legacy, $reader));

            if ($differentFields !== []) {
                $mismatches[] = sprintf(
                    'Node %d differs in field(s): %s.',
                    $nodeId,
                    implode(', ', $differentFields),
                );
            }
        }

        return $mismatches;
    }

    /**
     * @return array<string, int|string|null>
     */
    private function comparableValues(OsmNode $node): array
    {
        $tags = $node->tags ?? [];
        ksort($tags);

        return [
            'osm_id' => (int) $node->osm_id,
            'latitude' => number_format((float) $node->latitude, 7, '.', ''),
            'longitude' => number_format((float) $node->longitude, 7, '.', ''),
            'tags' => json_encode($tags, JSON_THROW_ON_ERROR),
            'surveillance_type' => $node->surveillance_type,
            'direction' => $node->direction,
            'camera_direction' => $node->camera_direction,
            'osm_updated_at' => $node->osm_updated_at?->utc()->toIso8601String(),
            'osm_version' => $node->osm_version,
            'osm_changeset_id' => $node->osm_changeset_id,
            'osm_user' => $node->osm_user,
            'osm_uid' => $node->osm_uid,
        ];
    }
}
