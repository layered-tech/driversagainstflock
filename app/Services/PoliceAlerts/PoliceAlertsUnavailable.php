<?php

namespace App\Services\PoliceAlerts;

use App\Services\Directions\DirectionsException;

class PoliceAlertsUnavailable extends DirectionsException
{
    public function __construct(public readonly int $retryAfter, int $status = 429)
    {
        parent::__construct('Police alerts are temporarily unavailable.', $status);
    }
}
