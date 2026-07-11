<?php

namespace App\Services;

use App\Repositories\MapRepository;
use Illuminate\Support\Facades\File;
use RuntimeException;
use Throwable;

class MarkerFileCache
{
    private const DIRECTORY = 'app/markers';

    private const FILENAME = 'markers.json';

    public function __construct(
        private readonly MapRepository $markerRepository,
        private readonly ?string $path = null,
    ) {}

    public function getOrCreatePath(): string
    {
        if (! File::exists($this->path())) {
            return $this->refresh();
        }

        return $this->path();
    }

    public function refresh(): string
    {
        return $this->withExclusiveLock(fn () => $this->writeMarkerFile());
    }

    public function delete(): void
    {
        File::delete($this->path());
    }

    public function path(): string
    {
        return $this->path ?? storage_path(self::DIRECTORY.DIRECTORY_SEPARATOR.self::FILENAME);
    }

    private function withExclusiveLock(callable $callback): string
    {
        File::ensureDirectoryExists($this->directory());

        $lockPath = $this->path().'.lock';
        $handle = fopen($lockPath, 'c');

        if ($handle === false) {
            throw new RuntimeException("Unable to open marker file lock: {$lockPath}");
        }

        try {
            if (! flock($handle, LOCK_EX)) {
                throw new RuntimeException("Unable to lock marker file: {$lockPath}");
            }

            return $callback();
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    private function writeMarkerFile(): string
    {
        File::ensureDirectoryExists($this->directory());

        $temporaryPath = $this->path().'.tmp';
        $handle = fopen($temporaryPath, 'wb');

        if ($handle === false) {
            throw new RuntimeException("Unable to open marker file for writing: {$temporaryPath}");
        }

        try {
            $this->write($handle, '{"points":[');

            $isFirstPoint = true;

            foreach ($this->markerRepository->lazyMarkerFilePoints() as $point) {
                if (! $isFirstPoint) {
                    $this->write($handle, ',');
                }

                $this->write($handle, json_encode($point, JSON_THROW_ON_ERROR));

                $isFirstPoint = false;
            }

            $this->write($handle, ']}');
        } catch (Throwable $exception) {
            fclose($handle);
            File::delete($temporaryPath);

            throw $exception;
        }

        fclose($handle);

        if (! rename($temporaryPath, $this->path())) {
            File::delete($temporaryPath);

            throw new RuntimeException("Unable to move marker file into place: {$this->path()}");
        }

        return $this->path();
    }

    private function directory(): string
    {
        return dirname($this->path());
    }

    private function write(mixed $handle, string $contents): void
    {
        if (fwrite($handle, $contents) === false) {
            throw new RuntimeException('Unable to write marker file contents.');
        }
    }
}
