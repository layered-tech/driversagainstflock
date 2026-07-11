<?php

namespace App\Console\Commands;

use App\Jobs\ProcessOverpassNodesChunk;
use App\Services\Overpass\OverpassChunkStore;
use App\Services\Overpass\OverpassNodeSynchronizer;
use Carbon\CarbonImmutable;
use Illuminate\Bus\Batch;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use SimpleXMLElement;
use Throwable;
use XMLReader;

class FetchOverpassDataCommand extends Command
{
    public const LAST_SUCCESSFUL_SYNC_CACHE_KEY = 'overpass:last_successful_osm_base';

    public const ACTIVE_BATCH_CACHE_KEY = 'overpass:active_batch';

    private const DEFAULT_CHUNK_SIZE = 500;

    private const CONNECT_TIMEOUT_SECONDS = 15;

    private const HTTP_TIMEOUT_SECONDS = 240;

    private const OVERPASS_QUERY_TIMEOUT_SECONDS = 170;

    private const MAX_DIFF_CURSOR_AGE_HOURS = 24;

    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:fetch-overpass-data
        {--all : Fetch data without geographical limitations}
        {--full : Fetch a full snapshot instead of changes since the last successful scan}
        {--no-reconcile : Skip soft-deleting missing nodes during a full snapshot}
        {--chunk=500 : Number of nodes to process per queued job}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Fetch ALPR nodes from Overpass API and sync markers';

    public function __construct(
        private OverpassNodeSynchronizer $synchronizer,
        private OverpassChunkStore $chunks,
    ) {
        parent::__construct();
    }

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        if ($this->hasActiveBatch()) {
            return self::SUCCESS;
        }

        $chunkSize = $this->chunkSize();

        if ($chunkSize === null) {
            return self::FAILURE;
        }

        $this->info('Starting to fetch data from Overpass API...');

        $bbox = $this->bbox();
        $lastSuccessfulSync = Cache::get(self::LAST_SUCCESSFUL_SYNC_CACHE_KEY);
        $isFullSync = $this->option('full') || ! is_string($lastSuccessfulSync) || $lastSuccessfulSync === '';

        if (! $isFullSync && $this->diffCursorIsStale($lastSuccessfulSync)) {
            $this->warn(
                sprintf(
                    'The saved Overpass cursor is older than %d hours; running a full snapshot sync instead.',
                    self::MAX_DIFF_CURSOR_AGE_HOURS,
                ),
            );

            Log::info('Overpass diff cursor is stale; using a full snapshot sync.', [
                'last_successful_sync' => $lastSuccessfulSync,
                'max_diff_cursor_age_hours' => self::MAX_DIFF_CURSOR_AGE_HOURS,
            ]);

            $isFullSync = true;
        }

        if ($bbox) {
            $this->info('Using geographical limitations (local environment).');
        } else {
            $this->info('Fetching data without geographical limitations.');
        }

        if ($isFullSync) {
            $query = $this->buildFullQuery($bbox);
            $this->info('Running a full Overpass snapshot sync.');
        } else {
            $query = $this->buildDiffQuery($lastSuccessfulSync, $bbox);
            $this->info("Running an Overpass diff sync since {$lastSuccessfulSync}.");
        }

        $responsePath = $this->temporaryResponsePath();

        try {
            $this->info('Sending request to Overpass API...');

            try {
                $response = $this->fetchOverpassResponse($query, $responsePath);
            } catch (ConnectionException $exception) {
                if ($isFullSync) {
                    return $this->failBecauseOverpassConnectionFailed($exception, 'full', $lastSuccessfulSync, $bbox);
                }

                $this->warn('The Overpass diff request timed out; retrying as a full snapshot sync.');

                Log::warning('Overpass diff request failed; retrying as a full snapshot sync.', [
                    'last_successful_sync' => $lastSuccessfulSync,
                    'endpoint' => config('directions.overpass_url'),
                    'timeout_seconds' => self::HTTP_TIMEOUT_SECONDS,
                    'error' => $exception->getMessage(),
                ]);

                $this->deleteTemporaryResponseFile($responsePath);
                $responsePath = $this->temporaryResponsePath();
                $isFullSync = true;
                $query = $this->buildFullQuery($bbox);
                $this->info('Running a full Overpass snapshot sync.');

                try {
                    $response = $this->fetchOverpassResponse($query, $responsePath);
                } catch (ConnectionException $fallbackException) {
                    return $this->failBecauseOverpassConnectionFailed($fallbackException, 'full', $lastSuccessfulSync, $bbox);
                }
            }

            if (! $response->successful()) {
                $this->error('Failed to fetch data from Overpass API');
                $this->error($this->responseBody($response, $responsePath));

                return self::FAILURE;
            }

            $this->ensureResponseFileHasBody($response, $responsePath);

            try {
                if ($isFullSync) {
                    $reconcileMissing = ! $this->option('no-reconcile');
                    $chunkImportId = (string) Str::uuid();
                    $prepared = $this->prepareFullResponse($responsePath, $chunkSize, $chunkImportId);
                } else {
                    $chunkImportId = null;
                    $prepared = $this->prepareDiffResponse($responsePath, $chunkSize);
                    $reconcileMissing = false;
                }
            } catch (RuntimeException $exception) {
                $this->error($exception->getMessage());
                $this->cleanupChunkImport($chunkImportId ?? null);

                return self::FAILURE;
            }

            $batch = $this->dispatchImportBatch(
                osmBase: $prepared['osm_base'],
                jobs: $prepared['jobs'],
                bbox: $bbox,
                reconcileMissing: $reconcileMissing,
                chunkImportId: $chunkImportId,
            );
        } finally {
            $this->deleteTemporaryResponseFile($responsePath);
        }

        if ($batch === null) {
            $this->info('Overpass data fetch completed without queued chunks.');

            return self::SUCCESS;
        }

        $this->info('Overpass data fetch queued.');
        $this->info("Queued batch {$batch->id} with {$batch->totalJobs} chunks.");
        $this->info('The sync cursor will advance after every chunk succeeds.');

        return self::SUCCESS;
    }

    /**
     * @return array{south: string, west: string, north: string, east: string}|null
     */
    private function bbox(): ?array
    {
        if (! app()->environment('local') || $this->option('all')) {
            return null;
        }

        [$south, $west, $north, $east] = explode(
            ',',
            '42.86531147472753,-88.60144071982785,43.31760597283634,-88.03851516660798'
        );

        return [
            'south' => $south,
            'west' => $west,
            'north' => $north,
            'east' => $east,
        ];
    }

    /**
     * @param  array{south: string, west: string, north: string, east: string}|null  $bbox
     */
    private function buildFullQuery(?array $bbox): string
    {
        return $this->settings('xml', $bbox).<<<'OVERPASS'
node["surveillance:type"="ALPR"];
out meta geom;
OVERPASS;
    }

    /**
     * @param  array{south: string, west: string, north: string, east: string}|null  $bbox
     */
    private function buildDiffQuery(string $lastSuccessfulSync, ?array $bbox): string
    {
        return $this->settings('xml', $bbox, $lastSuccessfulSync).<<<'OVERPASS'
node["surveillance:type"="ALPR"];
out meta geom;
OVERPASS;
    }

    /**
     * @param  array{south: string, west: string, north: string, east: string}|null  $bbox
     */
    private function settings(string $format, ?array $bbox, ?string $adiffSince = null): string
    {
        $settings = [
            "[out:{$format}]",
            '[timeout:'.self::OVERPASS_QUERY_TIMEOUT_SECONDS.']',
        ];

        if ($adiffSince) {
            $settings[] = '[adiff:"'.$this->escapeOverpassString($adiffSince).'"]';
        }

        if ($bbox) {
            $settings[] = "[bbox:{$bbox['south']},{$bbox['west']},{$bbox['north']},{$bbox['east']}]";
        }

        return implode('', $settings).';';
    }

    private function escapeOverpassString(string $value): string
    {
        return addcslashes($value, '\\"');
    }

    private function temporaryResponsePath(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'overpass-response-');

        if (! is_string($path)) {
            throw new RuntimeException('Could not create a temporary Overpass response file.');
        }

        return $path;
    }

    private function fetchOverpassResponse(string $query, string $responsePath): Response
    {
        return Http::asForm()
            ->accept('*/*')
            ->withUserAgent('DriversAgainstFlock/1.0 (+https://driversagainstflock.com)')
            ->connectTimeout(self::CONNECT_TIMEOUT_SECONDS)
            ->timeout(self::HTTP_TIMEOUT_SECONDS)
            ->withOptions([
                'sink' => $responsePath,
            ])
            ->post(config('directions.overpass_url'), [
                'data' => $query,
            ]);
    }

    /**
     * @param  array{south: string, west: string, north: string, east: string}|null  $bbox
     */
    private function failBecauseOverpassConnectionFailed(
        ConnectionException $exception,
        string $mode,
        mixed $lastSuccessfulSync,
        ?array $bbox,
    ): int {
        Log::error('Overpass data request failed before a response was received.', [
            'mode' => $mode,
            'last_successful_sync' => $lastSuccessfulSync,
            'has_bbox' => $bbox !== null,
            'endpoint' => config('directions.overpass_url'),
            'connect_timeout_seconds' => self::CONNECT_TIMEOUT_SECONDS,
            'timeout_seconds' => self::HTTP_TIMEOUT_SECONDS,
            'error' => $exception->getMessage(),
        ]);

        $this->error('Failed to fetch data from Overpass API before a response was received.');
        $this->error($exception->getMessage());

        return self::FAILURE;
    }

    private function diffCursorIsStale(string $lastSuccessfulSync): bool
    {
        try {
            $cursor = CarbonImmutable::parse($lastSuccessfulSync);
        } catch (Throwable) {
            return true;
        }

        return $cursor->lt(now()->subHours(self::MAX_DIFF_CURSOR_AGE_HOURS));
    }

    private function ensureResponseFileHasBody(Response $response, string $responsePath): void
    {
        clearstatcache(true, $responsePath);

        if (is_file($responsePath) && filesize($responsePath) > 0) {
            return;
        }

        $body = $response->body();

        if ($body === '') {
            return;
        }

        file_put_contents($responsePath, $body);
    }

    private function responseBody(Response $response, string $responsePath): string
    {
        $body = $response->body();

        if ($body !== '') {
            return $body;
        }

        if (! is_file($responsePath)) {
            return '';
        }

        $fileBody = file_get_contents($responsePath);

        return is_string($fileBody) ? $fileBody : '';
    }

    private function deleteTemporaryResponseFile(string $responsePath): void
    {
        if (is_file($responsePath)) {
            unlink($responsePath);
        }
    }

    /**
     * @return array{osm_base: string, jobs: array<int, ProcessOverpassNodesChunk>}
     */
    private function prepareFullResponse(
        string $responsePath,
        int $chunkSize,
        string $syncImportId,
    ): array {
        $reader = new XMLReader;

        if (! $reader->open($responsePath, null, LIBXML_NONET)) {
            throw new RuntimeException('Overpass returned invalid XML.');
        }

        $osmBase = '';
        $chunk = [];
        $jobs = [];
        $processed = 0;

        try {
            while ($reader->read()) {
                if ($reader->nodeType !== XMLReader::ELEMENT) {
                    continue;
                }

                if ($reader->name === 'meta') {
                    $osmBase = (string) $reader->getAttribute('osm_base');

                    continue;
                }

                if ($reader->name !== 'node') {
                    continue;
                }

                $nodeXml = $reader->readOuterXml();
                $node = $nodeXml === '' ? false : simplexml_load_string($nodeXml);
                $element = $node instanceof SimpleXMLElement ? $this->nodeElementFromXml($node) : null;

                if ($element === null) {
                    continue;
                }

                $chunk[] = $element;
                $processed++;

                if (count($chunk) === $chunkSize) {
                    $jobs[] = ProcessOverpassNodesChunk::fromUpsertsPath(
                        $this->chunks->writeUpserts($syncImportId, count($jobs) + 1, $chunk),
                        $syncImportId,
                    );
                    $chunk = [];
                }
            }
        } finally {
            $reader->close();
        }

        if ($osmBase === '') {
            throw new RuntimeException('Overpass response did not include an osm_base timestamp.');
        }

        if ($chunk !== []) {
            $jobs[] = ProcessOverpassNodesChunk::fromUpsertsPath(
                $this->chunks->writeUpserts($syncImportId, count($jobs) + 1, $chunk),
                $syncImportId,
            );
        }

        $this->info("Prepared {$processed} nodes from streamed Overpass XML.");

        return [
            'osm_base' => $osmBase,
            'jobs' => $jobs,
        ];
    }

    /**
     * @return array{osm_base: string, jobs: array<int, ProcessOverpassNodesChunk>}
     */
    private function prepareDiffResponse(string $responsePath, int $chunkSize): array
    {
        $body = file_get_contents($responsePath);

        if ($body === false || $body === '') {
            throw new RuntimeException('Overpass returned invalid XML.');
        }

        $xml = $this->parseXml($body);
        $osmBase = (string) ($xml->meta['osm_base'] ?? '');

        if ($osmBase === '') {
            throw new RuntimeException('Overpass response did not include an osm_base timestamp.');
        }

        $upserts = [];
        $deletes = [];

        foreach ($xml->action as $action) {
            $type = (string) $action['type'];

            if ($type === 'delete') {
                $node = $this->firstNodeElement($action->old) ?? $this->firstNodeElement($action->new);
                $nodeId = $node ? (int) $node['id'] : 0;

                if ($nodeId > 0) {
                    $deletes[] = $nodeId;
                }

                continue;
            }

            if ($type === 'create' || $type === 'modify') {
                $node = $this->firstNodeElement($action->new) ?? $this->firstNodeElement($action);
                $element = $node ? $this->nodeElementFromXml($node) : null;

                if ($element !== null) {
                    $upserts[] = $element;
                }
            }
        }

        $this->info('Prepared '.count($upserts).' changed nodes and '.count($deletes).' deleted nodes.');

        return [
            'osm_base' => $osmBase,
            'jobs' => $this->chunkJobs($upserts, $deletes, $chunkSize),
        ];
    }

    private function parseXml(string $body): SimpleXMLElement
    {
        $previous = libxml_use_internal_errors(true);
        libxml_clear_errors();

        $xml = simplexml_load_string($body);

        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $xml instanceof SimpleXMLElement || $xml->getName() !== 'osm') {
            throw new RuntimeException('Overpass returned invalid XML.');
        }

        return $xml;
    }

    private function firstNodeElement(SimpleXMLElement $xml): ?SimpleXMLElement
    {
        if (isset($xml->node[0])) {
            return $xml->node[0];
        }

        return null;
    }

    /**
     * @return array{id: int, lat: float, lon: float, tags: array<string, string>|null, timestamp: string|null, version: int|null, changeset: int|null, user: string|null, uid: int|null}|null
     */
    private function nodeElementFromXml(SimpleXMLElement $node): ?array
    {
        $id = (int) $node['id'];
        $lat = (string) $node['lat'];
        $lon = (string) $node['lon'];

        if ($id <= 0 || ! is_numeric($lat) || ! is_numeric($lon)) {
            return null;
        }

        $tags = [];

        foreach ($node->tag as $tag) {
            $tags[(string) $tag['k']] = (string) $tag['v'];
        }

        return [
            'id' => $id,
            'lat' => (float) $lat,
            'lon' => (float) $lon,
            'tags' => $tags ?: null,
            'timestamp' => $this->nullableXmlString($node['timestamp'] ?? null),
            'version' => $this->nullableXmlInteger($node['version'] ?? null),
            'changeset' => $this->nullableXmlInteger($node['changeset'] ?? null),
            'user' => $this->nullableXmlString($node['user'] ?? null),
            'uid' => $this->nullableXmlInteger($node['uid'] ?? null),
        ];
    }

    private function nullableXmlString(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    private function nullableXmlInteger(mixed $value): ?int
    {
        if ($value === null || ! is_numeric((string) $value)) {
            return null;
        }

        return (int) (string) $value;
    }

    /**
     * @param  array<int, ProcessOverpassNodesChunk>  $jobs
     * @param  array{south: string, west: string, north: string, east: string}|null  $bbox
     */
    private function dispatchImportBatch(
        string $osmBase,
        array $jobs,
        ?array $bbox,
        bool $reconcileMissing,
        ?string $chunkImportId,
    ): ?Batch {
        if ($jobs === []) {
            $this->finalizeSuccessfulImport($osmBase, $bbox, $reconcileMissing, $chunkImportId);
            $this->cleanupChunkImport($chunkImportId);

            return null;
        }

        return Bus::batch($jobs)
            ->name("Overpass node sync {$osmBase}")
            ->before(function (Batch $batch): void {
                Cache::put(self::ACTIVE_BATCH_CACHE_KEY, $batch->id, now()->addHours(6));
            })
            ->then(function (Batch $batch) use ($osmBase, $bbox, $reconcileMissing, $chunkImportId): void {
                if ($reconcileMissing) {
                    app(OverpassNodeSynchronizer::class)->deleteMissingNodes($chunkImportId, $bbox);
                }

                Cache::forever(self::LAST_SUCCESSFUL_SYNC_CACHE_KEY, $osmBase);
            })
            ->catch(function (Batch $batch, Throwable $exception) use ($osmBase): void {
                Log::error('Overpass node sync batch failed.', [
                    'batch_id' => $batch->id,
                    'osm_base' => $osmBase,
                    'error' => $exception->getMessage(),
                ]);
            })
            ->finally(function (Batch $batch) use ($chunkImportId): void {
                Cache::forget(self::ACTIVE_BATCH_CACHE_KEY);

                if ($batch->failedJobs === 0 && is_string($chunkImportId)) {
                    app(OverpassChunkStore::class)->deleteImport($chunkImportId);
                }
            })
            ->dispatch();
    }

    /**
     * @param  array<int, array<string, mixed>>  $upserts
     * @param  array<int, int>  $deletes
     * @return array<int, ProcessOverpassNodesChunk>
     */
    private function chunkJobs(array $upserts, array $deletes, int $chunkSize): array
    {
        $jobs = [];

        foreach (array_chunk($upserts, $chunkSize) as $chunk) {
            $jobs[] = new ProcessOverpassNodesChunk($chunk);
        }

        foreach (array_chunk($deletes, $chunkSize) as $chunk) {
            $jobs[] = new ProcessOverpassNodesChunk([], $chunk);
        }

        return $jobs;
    }

    /**
     * @param  array{south: string, west: string, north: string, east: string}|null  $bbox
     */
    private function finalizeSuccessfulImport(
        string $osmBase,
        ?array $bbox,
        bool $reconcileMissing,
        ?string $syncImportId,
    ): void {
        if ($reconcileMissing) {
            $deleted = $this->synchronizer->deleteMissingNodes($syncImportId, $bbox);

            $this->info("Deleted {$deleted} missing nodes.");
        }

        Cache::forever(self::LAST_SUCCESSFUL_SYNC_CACHE_KEY, $osmBase);
    }

    private function cleanupChunkImport(?string $chunkImportId): void
    {
        if (is_string($chunkImportId)) {
            app(OverpassChunkStore::class)->deleteImport($chunkImportId);
        }
    }

    private function hasActiveBatch(): bool
    {
        $batchId = Cache::get(self::ACTIVE_BATCH_CACHE_KEY);

        if (! is_string($batchId) || $batchId === '') {
            return false;
        }

        $batch = Bus::findBatch($batchId);

        if ($batch instanceof Batch && ! $batch->finished() && ! $batch->cancelled()) {
            if ($batch->totalJobs === 0 && $batch->createdAt->lt(now()->subMinutes(5))) {
                Cache::forget(self::ACTIVE_BATCH_CACHE_KEY);

                return false;
            }

            $this->warn("Overpass sync batch {$batchId} is already running.");

            return true;
        }

        Cache::forget(self::ACTIVE_BATCH_CACHE_KEY);

        return false;
    }

    private function chunkSize(): ?int
    {
        $value = $this->option('chunk') ?? self::DEFAULT_CHUNK_SIZE;
        $chunkSize = filter_var($value, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1],
        ]);

        if ($chunkSize === false) {
            $this->error('The --chunk option must be a positive integer.');

            return null;
        }

        return $chunkSize;
    }
}
