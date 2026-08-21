export const privacyPage = {
    badgeLabels: [
        'Last updated August 2026',
        'Location optional',
        'No ads, ever',
    ],
    contactHeading: 'Questions?',
    contactText:
        'If anything here is unclear, or you want your account information deleted, reach us at',
    intro: 'We built Drivers Against Flock because tracking drivers is wrong. It would be hypocritical to turn around and track you. This page explains, in plain language, exactly what that means.',
    label: 'Legal',
    sharePath: '/privacy-policy',
    sections: [
        {
            id: 'overview',
            title: 'Overview',
            blocks: [
                {
                    type: 'paragraph',
                    text: 'Drivers Against Flock ("DAF," "we," "us") is a privacy-focused navigation app operated by LayeredTech, LLC. It is designed to collect only the information needed to provide app features.',
                },
                {
                    type: 'paragraph',
                    text: 'The app helps you search for places, view maps, get directions, and choose routes with privacy in mind. DAF works with or without location access — granting it can improve features like showing your current position, searching nearby, and routing from where you are, but the app stays usable if you deny it.',
                },
                {
                    type: 'paragraph',
                    text: 'We do not sell personal information. We do not use it for advertising. We do not build advertising profiles about users.',
                },
            ],
        },
        {
            id: 'info-we-collect',
            title: 'Information we collect and use',
            blocks: [
                { type: 'heading', text: 'Location information' },
                {
                    type: 'paragraph',
                    text: 'DAF may request access to your device’s location. If you grant it, your location may be used to provide app features such as:',
                },
                {
                    type: 'list',
                    items: [
                        'Showing your current location on the map',
                        'Searching for nearby places',
                        'Calculating routes and directions',
                        'Supporting navigation features',
                    ],
                },
                {
                    type: 'paragraph',
                    text: 'DAF does not store a raw GPS trail, trip origin or destination, or route geometry in the Scorecard. During an explicit guided or user-started free drive, the optional Scorecard records only sparse camera-crossing events, avoided public camera nodes, and trip totals. Those details are encrypted on your device, expire after 30 days, and are never sent to DAF, analytics, diagnostics, or a scorecard sync service. When location is needed for another feature you request, it may be sent to the service required to complete that request — for example, search information may go to Google Places, map requests may go to Mapbox, locality lookups may go to OpenStreetMap services, police-alert lookups may go to OpenWebNinja, and origin, destination, or route information may go to OpenRouteService.',
                },
                {
                    type: 'paragraph',
                    text: 'You can deny location access and still use the app, and you can revoke it at any time through your device settings.',
                },
                { type: 'heading', text: 'On-device Scorecard' },
                {
                    type: 'paragraph',
                    text: 'Scorecard recording is on by default for explicit DAF drives only. Camera crossings are matched on your phone against public camera coordinates. Every locally detected crossing reduces the privacy score; direction metadata changes only whether the timeline labels it confirmed or possible. Scores, levels, badges, trip history, and exposure events are not associated with an account and have no leaderboard or cloud sync.',
                },
                {
                    type: 'paragraph',
                    text: 'The app keeps non-geographic lifetime totals, XP, and badge unlocks until you delete them. You can pause Scorecard recording or delete all encrypted Scorecard data at any time from the Scorecard screen.',
                },
                { type: 'heading', text: 'Search and routing information' },
                {
                    type: 'paragraph',
                    text: 'When you search for a place, enter a destination, or request directions, the app may process that information to provide the feature. This can include search terms, manually entered locations, your current location (if enabled), route start and end points, and routing preferences.',
                },
                { type: 'heading', text: 'OpenStreetMap account information' },
                {
                    type: 'paragraph',
                    text: 'DAF lets you sign in using the OpenStreetMap.org OAuth provider. If you choose to, we may receive limited account information from OpenStreetMap — your display name, email address, and OpenStreetMap user ID — which we use to identify your account and support connected features. DAF never receives or stores your OpenStreetMap password.',
                },
            ],
        },
        {
            id: 'third-party',
            title: 'Third-party services',
            blocks: [
                {
                    type: 'paragraph',
                    text: 'DAF uses the following third-party services to provide app features, depending on the feature you use and the app configuration:',
                },
                {
                    type: 'list',
                    items: [
                        'Google Places API (Google Maps Platform) — for autocomplete, text search, and place details. Search input, optional location bias or origin, and place identifiers may be sent with these requests. Autocomplete and its matching place-details request use a random client-generated session token for billing; DAF does not derive that token from your IP address or account ID.',
                        'Mapbox — for map rendering, map styles, map tiles, and optional traffic layers.',
                        'HEIGIT OpenRouteService — for directions and route calculation. Route origins, destinations, and route options may be sent with these requests.',
                        'OpenStreetMap Nominatim — for locality and ZIP-code geocoding and boundary lookups.',
                        'OpenStreetMap Overpass API — for nearby road, place, and speed-limit data used by map features.',
                        'OpenStreetMap.org API and OAuth — for optional account sign-in, authorized map edits, and OpenStreetMap data access.',
                        'OpenWebNinja Waze API — for nearby police-alert and traffic-incident data when that feature is enabled.',
                        'Firebase Analytics — for mobile-app usage analytics when enabled. The current app may send search terms, place identifiers, event metadata, and a signed-in account identifier. Scorecard screens, trips, exposures, scores, badges, and local Scorecard identifiers are excluded.',
                        'Sentry — for crash, error, and network monitoring when configured and enabled. Diagnostic event data and request URLs may be included. Scorecard screens, navigation, and local Scorecard data are excluded from diagnostics.',
                    ],
                },
                {
                    type: 'paragraph',
                    text: 'When you use a feature that depends on one of these services, the information needed to complete your request may be sent to the relevant service. Those providers may process information under their own privacy policies and terms.',
                },
            ],
        },
        {
            id: 'no-sell',
            title: 'Not sold, not for advertising',
            blocks: [
                {
                    type: 'list',
                    items: [
                        'DAF does not sell personal information.',
                        'DAF does not share personal information with advertisers.',
                        'DAF does not use your location, search, routing, or account information to build advertising profiles.',
                    ],
                },
            ],
        },
        {
            id: 'how-we-use',
            title: 'How we use information',
            blocks: [
                {
                    type: 'paragraph',
                    text: 'We use information only to provide, maintain, and improve app functionality, including:',
                },
                {
                    type: 'list',
                    items: [
                        'Displaying maps and searching for places',
                        'Providing directions and supporting navigation',
                        'Showing route options',
                        'Authenticating users who choose to sign in with OpenStreetMap',
                        'Understanding app usage through Firebase Analytics when enabled',
                        'Maintaining app security and reliability',
                    ],
                },
            ],
        },
        {
            id: 'sharing',
            title: 'How information is shared',
            blocks: [
                {
                    type: 'paragraph',
                    text: 'DAF shares information with the third-party services listed above only as needed for the feature you request or for configured analytics, crash, and network monitoring. For example, place searches may use Google Places, maps may use Mapbox, directions may use HEIGIT OpenRouteService, locality and road lookups may use OpenStreetMap services, police-alert lookups may use OpenWebNinja, analytics may use Firebase, and diagnostics may use Sentry.',
                },
                {
                    type: 'paragraph',
                    text: 'We may also disclose information if required by law or legal process, or to protect the rights, safety, and security of DAF, LayeredTech, LLC, our users, or others.',
                },
            ],
        },
        {
            id: 'retention',
            title: 'Data retention',
            blocks: [
                {
                    type: 'paragraph',
                    text: 'DAF does not store your Scorecard history on its servers. The native mobile app may retain recent destinations, favorites, Home and Work locations, place details, and the current route on your device to support app features. Native mobile cache entries are stored through the operating system secure-storage facility; recent places are limited, place details expire after seven days, and the active route snapshot expires after twelve hours. Favorites and Home or Work locations remain until you remove them or clear app data.',
                },
                {
                    type: 'paragraph',
                    text: 'On native iOS and Android, Scorecard details are encrypted through the operating system secure-storage facility and limited to 30 days. They include timestamps and public camera coordinates for confirmed or possible crossings and avoided cameras, plus trip duration, distance, detour fuel estimates, and the trip-starting state used for the price calculation. Raw GPS samples, origins, destinations, driven route geometry, and plate or vehicle data are not stored in the Scorecard. Lifetime non-geographic totals, XP, and badge unlocks remain until you delete Scorecard history. The web app does not use a plaintext Scorecard fallback.',
                },
                {
                    type: 'paragraph',
                    text: 'Backend requests and diagnostic events may also be processed by DAF and the configured providers above for operating, securing, and troubleshooting the service. If you sign in with OpenStreetMap, we may retain your display name, email address, and OpenStreetMap user ID for as long as needed to support your account or app features.',
                },
                {
                    type: 'paragraph',
                    text: 'If you want your account information deleted, contact us at support@driversagainstflock.com.',
                },
            ],
        },
        {
            id: 'your-choices',
            title: 'Your choices',
            blocks: [
                {
                    type: 'paragraph',
                    text: 'You control whether DAF can access your location. You can:',
                },
                {
                    type: 'list',
                    items: [
                        'Deny location access when prompted',
                        'Use the app without location access',
                        'Enter locations manually instead of using your current location',
                        'Revoke location access through your device settings',
                        'Pause on-device Scorecard recording',
                        'Delete encrypted Scorecard history, lifetime XP, and badges from the Scorecard screen',
                        'Choose whether to sign in with OpenStreetMap',
                        'Request deletion of account information associated with your OpenStreetMap login',
                    ],
                },
            ],
        },
        {
            id: 'osm-signin',
            title: 'OpenStreetMap sign-in',
            blocks: [
                {
                    type: 'paragraph',
                    text: 'DAF uses OpenStreetMap OAuth for optional account sign-in. OAuth lets you sign in with your OpenStreetMap account without giving DAF your OpenStreetMap password.',
                },
                {
                    type: 'paragraph',
                    text: 'If you use OpenStreetMap sign-in, OpenStreetMap may provide us with your display name, email address, and OpenStreetMap user ID.',
                },
            ],
        },
        {
            id: 'security',
            title: 'Security',
            blocks: [
                {
                    type: 'paragraph',
                    text: 'We use reasonable technical and organizational measures to protect the information we process. No system can be guaranteed completely secure, but DAF is designed to limit collection. Scorecard data is minimized, encrypted on the native device, excluded from telemetry and server sync, and automatically stripped of geographic detail after 30 days.',
                },
            ],
        },
        {
            id: 'children',
            title: 'Children’s privacy',
            blocks: [
                {
                    type: 'paragraph',
                    text: 'DAF is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us personal information, contact us and we will take appropriate steps to delete it.',
                },
            ],
        },
        {
            id: 'changes',
            title: 'Changes to this policy',
            blocks: [
                {
                    type: 'paragraph',
                    text: 'We may update this Privacy Policy from time to time. If we make material changes, we will update the "Last updated" date above and may provide additional notice in the app or on our website.',
                },
            ],
        },
    ],
    summary: [
        {
            title: 'Location is optional',
            body: 'The app works with or without it. Explicit drives can keep a sparse, encrypted 30-day Scorecard on your phone; raw GPS trails are not stored and nothing is synced.',
        },
        {
            title: 'We don’t sell or advertise',
            body: 'No selling personal data, no advertisers, no advertising profiles. Ever.',
        },
        {
            title: 'Sign-in is optional',
            body: 'Use OpenStreetMap OAuth if you want — we never see your password, only the basics you allow.',
        },
    ],
    title: 'Privacy Policy',
};
