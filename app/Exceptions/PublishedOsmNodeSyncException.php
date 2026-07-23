<?php

namespace App\Exceptions;

use RuntimeException;
use Throwable;

class PublishedOsmNodeSyncException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status = 502,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, previous: $previous);
    }

    public static function upstream(?Throwable $previous = null): self
    {
        return new self(
            'Published OpenStreetMap nodes could not be loaded.',
            previous: $previous,
        );
    }

    public static function unverified(): self
    {
        return new self(
            'OpenStreetMap did not return the published ALPR nodes.',
            422,
        );
    }
}
