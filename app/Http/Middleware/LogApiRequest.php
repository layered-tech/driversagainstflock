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
            if (Str::contains(Str::lower((string) $key), self::SENSITIVE_PAYLOAD_FIELD_FRAGMENTS)) {
                $payload[$key] = '[REDACTED]';

                continue;
            }

            if (is_array($value)) {
                $payload[$key] = $this->redactPayload($value);
            }
        }

        return $payload;
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
