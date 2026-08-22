<?php

use Illuminate\Support\Env;

it('uses the configured Redis queue', function () {
    $environment = Env::getRepository();
    $originalQueue = $environment->get('REDIS_QUEUE');

    $environment->set('REDIS_QUEUE', 'staging');

    try {
        $configuration = require dirname(__DIR__, 2).'/config/horizon.php';

        expect($configuration)
            ->toHaveKey('defaults.supervisor-1.queue', ['staging'])
            ->toHaveKey('waits.redis:staging', 60);
    } finally {
        $originalQueue === null
            ? $environment->clear('REDIS_QUEUE')
            : $environment->set('REDIS_QUEUE', $originalQueue);
    }
});
