<?php

namespace App\Console\Commands;

use App\Jobs\ProcessModeration;
use App\Models\ModerationProcess;
use App\Services\OpenStreetMap\ModerationProcessing;
use Illuminate\Console\Command;
use InvalidArgumentException;
use Laravel\Telescope\Telescope;
use Throwable;

class ProcessModerationCommand extends Command
{
    protected $signature = 'moderation:process {kind : outcomes, rules, profiles, summaries, warm, or status} {--node= : Process outcomes or rules for one node} {--user= : Refresh one editor summary or process nodes edited by this OSM user ID} {--rule= : Apply one enabled rule} {--limit= : Maximum eligible editors or nodes, ordered by ID} {--rebuild : Rebuild selected outcomes or editor summaries} {--sync : Execute a bounded selection immediately}';

    protected $description = 'Run moderation processing on all eligible records or a selection, or display run status';

    public function handle(ModerationProcessing $processing): int
    {
        $kind = $this->argument('kind');
        $ids = [];
        foreach (['node', 'user', 'rule', 'limit'] as $option) {
            $value = $this->option($option);
            if (($value === null && $this->input->hasParameterOption('--'.$option))
                || ($value !== null && (filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false || ! ctype_digit($value)))) {
                $this->components->error('--'.$option.' accepts a positive integer.');

                return self::INVALID;
            }
            $ids[$option] = $value !== null ? (int) $value : null;
        }
        $sync = (bool) $this->option('sync');
        $rebuild = (bool) $this->option('rebuild');
        if (! in_array($kind, ['outcomes', 'rules', 'profiles', 'summaries', 'warm', 'status'], true)
            || ($ids['node'] !== null && ! in_array($kind, ['outcomes', 'rules'], true))
            || ($ids['user'] !== null && ! in_array($kind, ['outcomes', 'rules', 'summaries'], true))
            || ($ids['rule'] !== null && $kind !== 'rules')
            || ($ids['limit'] !== null && ! in_array($kind, ['outcomes', 'rules', 'summaries'], true))
            || ($ids['node'] !== null && $ids['user'] !== null)
            || ($rebuild && ! in_array($kind, ['outcomes', 'summaries'], true))
            || ($sync && (! in_array($kind, ['outcomes', 'rules', 'summaries'], true)
                || ($ids['limit'] === null && $ids['node'] === null && ! ($kind === 'summaries' && $ids['user'] !== null))))) {
            $this->components->error('Unsupported option combination. --node and --user are mutually exclusive; --sync requires --limit, --node, or summaries --user.');

            return self::INVALID;
        }
        if ($kind === 'status') {
            $this->table(
                ['Process', 'State', 'Jobs', 'Pending', 'Failed', 'Last success', 'Last error'],
                ModerationProcess::orderBy('name')->get()->map(fn (ModerationProcess $process): array => [
                    $process->name,
                    $process->state,
                    $process->total_jobs,
                    $process->pending_jobs,
                    $process->failed_jobs,
                    $process->last_success_at,
                    $process->last_error,
                ]),
            );

            return self::SUCCESS;
        }
        $started = microtime(true);
        $completed = 0;
        $failed = 0;
        $execute = $sync ? function (ProcessModeration $job) use ($processing, &$completed, &$failed): void {
            $target = $job->kind.' '.$job->target.($job->ruleId !== null ? ' rule '.$job->ruleId : '');
            $this->line('Processing '.$target);
            try {
                $job->handleSynchronously($processing);
                $completed++;
            } catch (Throwable $exception) {
                $failed++;
                $this->components->error('Failed '.$target.': '.$exception->getMessage());
                throw $exception;
            }
        } : null;
        try {
            $result = Telescope::withoutRecording(
                fn (): array => $processing->dispatch(
                    $kind,
                    $ids['node'],
                    $ids['user'],
                    $rebuild,
                    $ids['limit'],
                    $ids['rule'],
                    $execute,
                ),
            );
        } catch (InvalidArgumentException $exception) {
            $this->components->error($exception->getMessage());

            return self::INVALID;
        } catch (Throwable $exception) {
            report($exception);
            $this->components->error('Moderation processing stopped: '.$exception->getMessage());

            return self::FAILURE;
        } finally {
            if ($sync) {
                $this->line(sprintf('Completed %d jobs; failed %d jobs in %.2fs.', $completed, $failed, microtime(true) - $started));
            }
        }
        if (! $sync) {
            $this->components->info("Queued {$result['jobs']} independent moderation jobs across {$result['processes']} process runs.");
        }
        if ($kind === 'rules') {
            $this->line("Selected {$result['nodes']} nodes; ".($sync ? 'completed' : 'queued')." {$result['jobs']} rule evaluations.");
        }
        if ($result['skipped'] !== []) {
            $this->components->warn('Already running: '.implode(', ', $result['skipped']));
        }

        return $sync && $result['skipped'] !== [] ? self::FAILURE : self::SUCCESS;
    }
}
