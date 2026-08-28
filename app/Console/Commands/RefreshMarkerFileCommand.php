<?php

namespace App\Console\Commands;

use App\Jobs\RefreshMarkerFile;
use Illuminate\Console\Command;

class RefreshMarkerFileCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'markers:refresh-file';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Queue a refresh of the static nationwide markers payload';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        RefreshMarkerFile::dispatch();

        $this->components->info('Marker file refresh queued.');

        return self::SUCCESS;
    }
}
