<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property list<array{kind: string, target: int, state: string, published?: bool}>|null $dispatch_batch
 */
class ModerationProcess extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'run_number' => 'integer',
            'total_jobs' => 'integer',
            'pending_jobs' => 'integer',
            'failed_jobs' => 'integer',
            'dispatch_batch' => 'array',
            'started_at' => 'immutable_datetime',
            'last_success_at' => 'immutable_datetime',
        ];
    }
}
