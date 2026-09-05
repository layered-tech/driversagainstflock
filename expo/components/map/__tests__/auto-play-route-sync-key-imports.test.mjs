import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const autoPlaySource = readFileSync(
    new URL('../../auto-play.js', import.meta.url),
    'utf8',
);
const sharedRoutingStateSource = readFileSync(
    new URL('../shared-routing-state.js', import.meta.url),
    'utf8',
);

function getImportedIdentifiers(source) {
    const identifiers = new Set();

    for (const match of source.matchAll(
        /^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"];?/gm,
    )) {
        const clause = match[1];
        const namedMatch = clause.match(/\{([^}]*)\}/);

        if (namedMatch) {
            for (const specifier of namedMatch[1].split(',')) {
                const local = specifier.trim().split(/\s+as\s+/).pop();

                if (local) {
                    identifiers.add(local);
                }
            }
        }

        const defaultMatch = clause.match(/^(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)/);

        if (defaultMatch) {
            identifiers.add(defaultMatch[1]);
        }
    }

    return identifiers;
}

function getLocallyDeclaredIdentifiers(source) {
    const identifiers = new Set();

    for (const match of source.matchAll(
        /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    )) {
        identifiers.add(match[1]);
    }

    for (const match of source.matchAll(
        /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm,
    )) {
        identifiers.add(match[1]);
    }

    return identifiers;
}

function getCalledSyncKeyHelpers(source) {
    const helpers = new Set();

    for (const match of source.matchAll(/\b(get\w*SyncKey)\s*\(/g)) {
        helpers.add(match[1]);
    }

    return helpers;
}

describe('auto-play route sync key helpers', () => {
    const imported = getImportedIdentifiers(autoPlaySource);
    const declared = getLocallyDeclaredIdentifiers(autoPlaySource);
    const called = getCalledSyncKeyHelpers(autoPlaySource);

    test('auto-play.js calls sync key helpers', () => {
        assert.ok(called.has('getDirectionsRouteSyncKey'));
        assert.ok(called.has('getDirectionsRouteGeometrySyncKey'));
    });

    test('every sync key helper called in auto-play.js is imported or declared', () => {
        const missing = [...called].filter(
            (name) => !imported.has(name) && !declared.has(name),
        );

        assert.deepEqual(
            missing,
            [],
            `auto-play.js references undefined sync key helpers: ${missing.join(', ')}`,
        );
    });

    test('sync key helpers imported from shared-routing-state are exported by it', () => {
        const sharedRoutingStateImport = autoPlaySource.match(
            /import\s*\{([^}]*)\}\s*from\s+'\.\/map\/shared-routing-state';/,
        );

        assert.ok(sharedRoutingStateImport, 'expected shared-routing-state import');

        const specifiers = sharedRoutingStateImport[1]
            .split(',')
            .map((specifier) => specifier.trim().split(/\s+as\s+/)[0])
            .filter(Boolean);

        assert.ok(specifiers.includes('getDirectionsRouteSyncKey'));
        assert.ok(specifiers.includes('getDirectionsRouteGeometrySyncKey'));

        const exported = new Set(
            [
                ...sharedRoutingStateSource.matchAll(
                    /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
                ),
                ...sharedRoutingStateSource.matchAll(
                    /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm,
                ),
            ].map((match) => match[1]),
        );

        for (const specifier of specifiers) {
            assert.ok(
                exported.has(specifier),
                `shared-routing-state does not export ${specifier}`,
            );
        }
    });
});
