import { redactPrivateScorecardPath } from './privacy-routes.js';

const PRIVATE_FIELD =
    /^(?:authorization|cookie|setcookie|password|secret|.*token|.*apikey|email|.*emailaddress|name|displayname|latitude|longitude|lat|lng|lon|.*coordinates?|coords|location|origin|destination|bounds|address|searchterm|searchterms|query|placeid|itemid|tripid|eventid|localid|notes?|body|requestbody|responsebody|scorecard|scorecardstate|trips?|events?|records?)$/i;

function sanitizeDiagnosticText(value) {
    return redactPrivateScorecardPath(value)
        .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => {
            try {
                const url = new URL(match);
                url.username = '';
                url.password = '';
                url.search = '';
                url.hash = '';
                return url.toString();
            } catch {
                return '[redacted URL]';
            }
        })
        .replace(
            /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
            '[redacted email]',
        )
        .replace(
            /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.\-]+/gi,
            '[redacted authorization]',
        )
        .replace(
            /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
            '[redacted token]',
        )
        .replace(
            /((?:[\w-]*(?:token|password|secret|api[_-]?key)|authorization)["\']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
            '$1[redacted]',
        )
        .replace(
            /((?:latitude|longitude|lat|lng|lon)["']?\s*[=:]\s*)-?\d+(?:\.\d+)?/gi,
            '$1[redacted]',
        )
        .replace(
            /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/g,
            '[redacted coordinates]',
        );
}

export function sanitizeDiagnosticValue(value, depth = 0) {
    if (depth > 6) {
        return '[redacted]';
    }

    if (typeof value === 'string') {
        return sanitizeDiagnosticText(value);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeDiagnosticValue(entry, depth + 1));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [
                key,
                PRIVATE_FIELD.test(key.replace(/[^a-z0-9]/gi, ''))
                    ? '[redacted]'
                    : sanitizeDiagnosticValue(entry, depth + 1),
            ]),
        );
    }

    return typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null
        ? value
        : undefined;
}

export function sanitizeDiagnosticError(error) {
    const safeError = new Error(
        sanitizeDiagnosticText(
            String(error?.message ?? error ?? 'Unknown error'),
        ),
    );
    safeError.name = sanitizeDiagnosticText(String(error?.name ?? 'Error'));

    if (typeof error?.stack === 'string') {
        safeError.stack = sanitizeDiagnosticText(error.stack);
    }

    return safeError;
}
