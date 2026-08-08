<?php

use App\Support\NightwatchPrivacyRedactor;
use Illuminate\Http\UploadedFile;
use Laravel\Nightwatch\Records\Exception as NightwatchException;
use Laravel\Nightwatch\Records\OutgoingRequest as NightwatchOutgoingRequest;
use Laravel\Nightwatch\Records\Request as NightwatchRequest;
use Symfony\Component\HttpFoundation\FileBag;
use Symfony\Component\HttpFoundation\HeaderBag;
use Symfony\Component\HttpFoundation\InputBag;

it('removes private data from incoming request records', function () {
    $request = new NightwatchRequest(
        method: 'GET',
        url: 'https://driversagainstflock.org/api/place/private-search?query=home&latitude=30.2672',
        routeName: '',
        routeMethods: ['GET'],
        routeDomain: '',
        routePath: '/api/place/{placeId}',
        routeAction: 'PlaceController',
        ip: '50.53.92.156',
        duration: 10,
        statusCode: 200,
        requestSize: 100,
        responseSize: 200,
        headers: new HeaderBag([
            'Referer' => 'https://driversagainstflock.org/map?query=home',
            'X-Forwarded-For' => '50.53.92.156',
            'User-Agent' => 'DAF',
        ]),
        payload: new InputBag(['textQuery' => 'home']),
        files: new FileBag(['photo' => UploadedFile::fake()->create('private.jpg')]),
    );

    (new NightwatchPrivacyRedactor)->redactRequest($request);

    expect($request->url)->toBe('https://driversagainstflock.org/api/place/{placeId}')
        ->and($request->ip)->toBe('[REDACTED]')
        ->and($request->headers->get('referer'))->toBe('[REDACTED]')
        ->and($request->headers->get('x-forwarded-for'))->toBe('[REDACTED]')
        ->and($request->headers->get('user-agent'))->toBe('DAF')
        ->and($request->payload->all())->toBe([])
        ->and($request->files->all())->toBe([]);
});

it('retains only the origin for outgoing request records', function () {
    $request = new NightwatchOutgoingRequest(
        method: 'GET',
        url: 'https://places.googleapis.com/v1/places/private-id?textQuery=home&location=30.2672,-97.7431',
        duration: 10,
        requestSize: 100,
        responseSize: 200,
        statusCode: 200,
    );

    (new NightwatchPrivacyRedactor)->redactOutgoingRequest($request);

    expect($request->url)->toBe('https://places.googleapis.com');
});

it('removes URLs locations searches and IP addresses from exception messages', function () {
    $exception = new NightwatchException(
        class: RuntimeException::class,
        message: 'Search query="home" failed near -97.7431, 30.2672 at https://example.com/route?destination=home from 50.53.92.156 latitude=30.2672.',
        code: 0,
        file: __FILE__,
        line: __LINE__,
        handled: false,
    );

    (new NightwatchPrivacyRedactor)->redactException($exception);

    expect($exception->message)
        ->toBe('Search query=[REDACTED] failed near [REDACTED LOCATION] at [REDACTED URL] from [REDACTED IP] latitude=[REDACTED].');
});
