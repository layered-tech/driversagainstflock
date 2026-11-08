<?php

use Illuminate\Support\Facades\Storage;

test('retired Wisconsin discovery never reads storage or serves a bundled catalog', function () {
    Storage::shouldReceive('disk')->never();

    $this->getJson('/api/v1/road-corridor-manifest')->assertNotFound();
});
