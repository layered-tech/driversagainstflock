<?php

namespace App\Console\Commands;

use App\Services\MarkerFileCache;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

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
    protected $description = 'Refresh the static nationwide markers payload';

    /**
     * Execute the console command.
     */
    public function handle(MarkerFileCache $markerFileCache): int
    {
        $path = $markerFileCache->refresh();

        $this->components->info('Marker file refreshed.');
        $this->line($path);
        $this->line(File::size($path).' bytes');

        return self::SUCCESS;
    }
}
