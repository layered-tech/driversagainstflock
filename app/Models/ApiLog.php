<?php

namespace App\Models;

use Database\Factories\ApiLogFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ApiLog extends Model
{
    /** @use HasFactory<ApiLogFactory> */
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'method',
        'request_path',
        'status',
        'elapsed_ms',
        'request_headers',
        'request_payload',
        'response_headers',
        'response_payload',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'status' => 'integer',
        'elapsed_ms' => 'integer',
        'request_headers' => 'array',
        'request_payload' => 'array',
        'response_headers' => 'array',
        'response_payload' => 'array',
    ];
}
