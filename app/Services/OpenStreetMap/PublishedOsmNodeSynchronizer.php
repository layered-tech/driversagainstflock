<?php

namespace App\Services\OpenStreetMap;

use App\Exceptions\PublishedOsmNodeSyncException;
use App\Models\OsmNode;
use App\Repositories\MapRepository;
use App\Services\Overpass\OverpassNodeSynchronizer;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class PublishedOsmNodeSynchronizer
{
    private const CONNECT_TIMEOUT_SECONDS = 3;

    private const HTTP_TIMEOUT_SECONDS = 10;

    private const USER_AGENT = 'DriversAgainstFlock/1.0 (+https://driversagainstflock.com)';

    public function __construct(
        private OverpassNodeSynchronizer $nodeSynchronizer,
        private MapRepository $mapRepository,
    ) {}

    /**
     * @param  array<int, array{id: int, version: int}>  $nodes
     * @return array{synced: int, created: int, updated: int, points: array<int, array<string, mixed>>}
     */
    public function sync(int $changesetId, array $nodes): array
    {
        $elements = $this->fetchVerifiedElements($changesetId, $nodes);
        $result = $this->nodeSynchronizer->syncMany($elements);
        $points = $this->markerPoints($nodes);

        return [
            'synced' => $result['synced'],
            'created' => $result['created'],
            'updated' => $result['updated'],
            'points' => $points,
        ];
    }

    /**
     * @param  array<int, array{id: int, version: int}>  $nodes
     * @return array<int, array<string, mixed>>
     */
    private function fetchVerifiedElements(int $changesetId, array $nodes): array
    {
        try {
            $response = Http::acceptJson()
                ->withUserAgent(self::USER_AGENT)
                ->connectTimeout(self::CONNECT_TIMEOUT_SECONDS)
                ->timeout(self::HTTP_TIMEOUT_SECONDS)
                ->retry(2, 150, throw: false)
                ->get($this->apiUrl('/nodes.json'), [
                    'nodes' => collect($nodes)
                        ->map(fn (array $node): string => (string) $node['id'])
                        ->implode(','),
                ]);
        } catch (ConnectionException $exception) {
            throw PublishedOsmNodeSyncException::upstream($exception);
        }

        if (! $response->successful()) {
            throw PublishedOsmNodeSyncException::upstream();
        }

        $elements = $response->json('elements');

        if (! is_array($elements)) {
            throw PublishedOsmNodeSyncException::upstream();
        }

        $expectedNodes = collect($nodes)->keyBy(
            fn (array $node): string => $this->nodeVersionKey($node['id'], $node['version']),
        );
        $verifiedElements = [];

        foreach ($elements as $element) {
            if (! is_array($element)) {
                continue;
            }

            $nodeId = $element['id'] ?? null;
            $version = $element['version'] ?? null;
            $key = is_numeric($nodeId) && is_numeric($version)
                ? $this->nodeVersionKey((int) $nodeId, (int) $version)
                : null;

            if (
                $key === null
                || ! $expectedNodes->has($key)
                || ($element['type'] ?? null) !== 'node'
                || ($element['visible'] ?? true) === false
                || (int) ($element['changeset'] ?? 0) !== $changesetId
                || ($element['tags']['surveillance:type'] ?? null) !== 'ALPR'
                || ! is_numeric($element['lat'] ?? null)
                || ! is_numeric($element['lon'] ?? null)
            ) {
                continue;
            }

            $verifiedElements[$key] = $element;
        }

        if (count($verifiedElements) !== $expectedNodes->count()) {
            throw PublishedOsmNodeSyncException::unverified();
        }

        return array_values($verifiedElements);
    }

    /**
     * @param  array<int, array{id: int, version: int}>  $nodes
     * @return array<int, array<string, mixed>>
     */
    private function markerPoints(array $nodes): array
    {
        $osmNodeIds = array_column($nodes, 'id');
        $storedNodes = OsmNode::query()
            ->whereIntegerInRaw('osm_id', $osmNodeIds)
            ->get()
            ->keyBy('osm_id');

        return collect($osmNodeIds)
            ->map(function (int $osmNodeId) use ($storedNodes): ?array {
                $node = $storedNodes->get($osmNodeId);

                return $node instanceof OsmNode
                    ? $this->mapRepository->transformOsmNode($node)
                    : null;
            })
            ->filter()
            ->values()
            ->all();
    }

    private function apiUrl(string $path): string
    {
        return rtrim((string) config('services.openstreetmap.api_url'), '/').'/'.ltrim($path, '/');
    }

    private function nodeVersionKey(int $nodeId, int $version): string
    {
        return $nodeId.':'.$version;
    }
}
