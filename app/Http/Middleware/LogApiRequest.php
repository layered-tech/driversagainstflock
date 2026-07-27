<?php

namespace App\Http\Middleware;

use App\Models\ApiLog;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class LogApiRequest
{
    private const SENSITIVE_HEADER_FRAGMENTS = [
        'authorization',
        'cookie',
        'secret',
        'token',
        'api-key',
        'api_key',
        'apikey',
    ];

    private const SENSITIVE_PAYLOAD_FIELD_FRAGMENTS = [
        'authorization',
        'password',
        'secret',
        'token',
        'api-key',
        'api_key',
        'apikey',
    ];

    private const PRIVATE_PAYLOAD_FIELD_FRAGMENTS = [
        'address',
        'bbox',
        'bound',
        'coordinate',
        'destination',
        'end',
        'input',
        'location',
        'origin',
        'position',
        'query',
        'route',
        'search',
        'start',
        'waypoint',
    ];

    private const PRIVATE_PAYLOAD_FIELD_SUFFIXES = [
        'lat',
        'latitude',
        'lng',
        'longitude',
        'lon',
    ];

    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $startedAt = hrtime(true);
        $response = $next($request);

        ApiLog::query()->create([
            'method' => $request->method(),
            'request_path' => $request->path(),
            'status' => $response->getStatusCode(),
            'elapsed_ms' => (int) round((hrtime(true) - $startedAt) / 1_000_000),
            'request_headers' => $this->redactHeaders($request->headers->all()),
            'request_payload' => $this->redactPayload($request->all()),
            'response_headers' => $this->redactHeaders($response->headers->all()),
            'response_payload' => $this->responsePayload($response),
        ]);

        return $response;
    }

    /**
     * @param  array<string, array<int, string>>  $headers
     * @return array<string, array<int, string>>
     */
    private function redactHeaders(array $headers): array
    {
        foreach ($headers as $name => $values) {
            if (Str::contains(Str::lower($name), self::SENSITIVE_HEADER_FRAGMENTS)) {
                $headers[$name] = ['[REDACTED]'];
            }
        }

        return $headers;
    }

    private function redactPayload(array $payload): array
    {
        foreach ($payload as $key => $value) {
            if ($this->isPrivatePayloadField((string) $key)) {
                $payload[$key] = '[REDACTED]';

                continue;
            }

            if (is_array($value)) {
                $payload[$key] = $this->redactPayload($value);
            }
        }

        return $payload;
    }

    private function isPrivatePayloadField(string $key): bool
    {
        $normalizedKey = Str::lower($key);

        return Str::contains($normalizedKey, [
            ...self::SENSITIVE_PAYLOAD_FIELD_FRAGMENTS,
            ...self::PRIVATE_PAYLOAD_FIELD_FRAGMENTS,
        ]) || Str::endsWith($normalizedKey, self::PRIVATE_PAYLOAD_FIELD_SUFFIXES);
    }

    private function responsePayload(Response $response): mixed
    {
        $content = $response->getContent();

        if ($content === false) {
            return null;
        }

        try {
            $payload = json_decode($content, associative: true, flags: JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return $content;
        }

        return is_array($payload) ? $this->redactPayload($payload) : $payload;
    }
}
