<?php

namespace App\Support;

use Illuminate\Support\Str;
use Illuminate\Support\Uri;
use Laravel\Nightwatch\Records\Exception as NightwatchException;
use Laravel\Nightwatch\Records\OutgoingRequest as NightwatchOutgoingRequest;
use Laravel\Nightwatch\Records\Request as NightwatchRequest;
use Symfony\Component\HttpFoundation\FileBag;
use Symfony\Component\HttpFoundation\InputBag;
use Throwable;

class NightwatchPrivacyRedactor
{
    private const PRIVATE_HEADER_FRAGMENTS = [
        'client-ip',
        'connecting-ip',
        'forwarded',
        'real-ip',
        'referer',
    ];

    private const ABSOLUTE_URL_PATTERN = '~https?://[^\s<>"\']+~iu';

    private const COORDINATE_PAIR_PATTERN = '~(?<![\d.-])-?\d{1,3}\.\d+[\s,]+-?\d{1,3}\.\d+(?![\d.-])~u';

    private const IP_ADDRESS_PATTERN = '~(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])~u';

    private const LABELED_COORDINATE_PATTERN = '~\b(latitude|longitude|lat|lng|lon)\b(\s*[:=]\s*)-?\d{1,3}(?:\.\d+)?~iu';

    private const LABELED_PRIVATE_VALUE_PATTERN = '~\b(text_?query|query|search(?:_term)?|address|origin|destination)\b(\s*[:=]\s*)(?:"[^"]*"|\'[^\']*\'|[^,\s}\]]+)~iu';

    public function redactRequest(NightwatchRequest $request): void
    {
        $request->url = $this->requestUrl($request->url, $request->routePath);
        $request->ip = '[REDACTED]';
        $request->payload = new InputBag;
        $request->files = new FileBag;

        foreach (array_keys($request->headers->all()) as $header) {
            if (Str::contains(Str::lower($header), self::PRIVATE_HEADER_FRAGMENTS)) {
                $request->headers->set($header, '[REDACTED]');
            }
        }
    }

    public function redactOutgoingRequest(NightwatchOutgoingRequest $request): void
    {
        $request->url = $this->urlOrigin($request->url) ?? '[REDACTED URL]';
    }

    public function redactException(NightwatchException $exception): void
    {
        $exception->message = $this->privateText($exception->message);
    }

    public function privateText(string $value): string
    {
        $redacted = preg_replace(self::ABSOLUTE_URL_PATTERN, '[REDACTED URL]', $value) ?? $value;
        $redacted = preg_replace(self::LABELED_PRIVATE_VALUE_PATTERN, '$1$2[REDACTED]', $redacted) ?? $redacted;
        $redacted = preg_replace(self::LABELED_COORDINATE_PATTERN, '$1$2[REDACTED]', $redacted) ?? $redacted;
        $redacted = preg_replace(self::COORDINATE_PAIR_PATTERN, '[REDACTED LOCATION]', $redacted) ?? $redacted;

        return preg_replace(self::IP_ADDRESS_PATTERN, '[REDACTED IP]', $redacted) ?? $redacted;
    }

    private function requestUrl(string $url, string $routePath): string
    {
        $origin = $this->urlOrigin($url);

        if ($origin === null) {
            return '[REDACTED URL]';
        }

        $safePath = $routePath === '' ? '/' : Str::start($routePath, '/');

        return $origin.$safePath;
    }

    private function urlOrigin(string $url): ?string
    {
        try {
            $uri = Uri::of($url);
            $scheme = $uri->scheme();
            $host = $uri->host();

            if ($scheme === null || $host === null || $host === '') {
                return null;
            }

            $host = Str::contains($host, ':') ? "[{$host}]" : $host;
            $port = $uri->port() === null ? '' : ':'.$uri->port();

            return "{$scheme}://{$host}{$port}";
        } catch (Throwable) {
            return null;
        }
    }
}
