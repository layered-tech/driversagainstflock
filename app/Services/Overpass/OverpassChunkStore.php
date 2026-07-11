<?php

namespace App\Services\Overpass;

use Illuminate\Filesystem\Filesystem;
use JsonException;
use RuntimeException;

class OverpassChunkStore
{
    public function __construct(private Filesystem $files) {}

    /**
     * @param  array<int, array<string, mixed>>  $upserts
     */
    public function writeUpserts(string $importId, int $chunkNumber, array $upserts): string
    {
        return $this->writeChunk($importId, $chunkNumber, 'upserts', $upserts);
    }

    /**
     * @param  array<int, int>  $deletes
     */
    public function writeDeletes(string $importId, int $chunkNumber, array $deletes): string
    {
        return $this->writeChunk($importId, $chunkNumber, 'deletes', $deletes);
    }

    /**
     * @return array<int, mixed>
     */
    public function read(string $path): array
    {
        if (! is_file($path)) {
            throw new RuntimeException("Overpass chunk file does not exist: {$path}");
        }

        $contents = file_get_contents($path);

        if ($contents === false) {
            throw new RuntimeException("Could not read Overpass chunk file: {$path}");
        }

        try {
            $decoded = json_decode($contents, true, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException("Could not decode Overpass chunk file: {$path}", previous: $exception);
        }

        if (! is_array($decoded)) {
            throw new RuntimeException("Overpass chunk file did not contain an array: {$path}");
        }

        return $decoded;
    }

    public function deleteFile(?string $path): void
    {
        if (is_string($path) && is_file($path)) {
            $this->files->delete($path);
        }
    }

    public function deleteImport(string $importId): void
    {
        $directory = $this->directory($importId);

        if (is_dir($directory)) {
            $this->files->deleteDirectory($directory);
        }
    }

    /**
     * @param  array<int, mixed>  $payload
     */
    private function writeChunk(string $importId, int $chunkNumber, string $type, array $payload): string
    {
        $directory = $this->directory($importId);
        $this->files->ensureDirectoryExists($directory);

        $path = $directory.'/'.sprintf('%s-%06d.json', $type, $chunkNumber);

        try {
            $encoded = json_encode($payload, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException("Could not encode Overpass chunk file: {$path}", previous: $exception);
        }

        if (file_put_contents($path, $encoded) === false) {
            throw new RuntimeException("Could not write Overpass chunk file: {$path}");
        }

        return $path;
    }

    private function directory(string $importId): string
    {
        return storage_path("app/overpass-imports/{$importId}");
    }
}
