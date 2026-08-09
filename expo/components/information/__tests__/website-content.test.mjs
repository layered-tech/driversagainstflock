import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { contributePage, faqItems } from '../community-content.js';
import { privacyPage } from '../privacy-content.js';
import { termsPage } from '../terms-content.js';

function getWebsiteArray(fileName, variableName) {
    const source = readFileSync(
        new URL(`../../../../resources/js/Pages/${fileName}`, import.meta.url),
        'utf8',
    );
    const match = source.match(
        new RegExp(`const ${variableName} = (\\[[\\s\\S]*?\\n\\]);`),
    );

    assert.ok(match, `Could not find ${variableName} in ${fileName}`);

    return Function(`return ${match[1]};`)();
}

describe('website information screens', () => {
    test('copy the Terms of Use source exactly', () => {
        assert.deepEqual(
            termsPage.summary,
            getWebsiteArray('Terms.vue', 'tldr'),
        );
        assert.deepEqual(
            termsPage.sections,
            getWebsiteArray('Terms.vue', 'termsSections'),
        );
        assert.equal(termsPage.badgeLabels[0], 'Effective June 2026');
    });

    test('copy the Privacy Policy source exactly', () => {
        assert.deepEqual(
            privacyPage.summary,
            getWebsiteArray('Privacy.vue', 'tldr'),
        );
        assert.deepEqual(
            privacyPage.sections,
            getWebsiteArray('Privacy.vue', 'privacySections'),
        );
        assert.equal(privacyPage.badgeLabels[0], 'Last updated August 2026');
    });

    test('copy the landing-page FAQs and support details exactly', () => {
        assert.deepEqual(faqItems, getWebsiteArray('Landing.vue', 'faqItems'));
        assert.deepEqual(
            contributePage.summary,
            getWebsiteArray('Help.vue', 'fundingUses'),
        );
        assert.equal(
            contributePage.donationUrl,
            'https://buymeacoffee.com/driversagainstflock',
        );
    });

    test('registers a dedicated native route for every website page', () => {
        const rootLayoutSource = readFileSync(
            new URL('../../../app/_layout.js', import.meta.url),
            'utf8',
        );

        ['faqs', 'contribute-to-daf', 'privacy-policy', 'terms-of-use'].forEach(
            (routeName) => {
                assert.match(
                    rootLayoutSource,
                    new RegExp(`name="${routeName}"`),
                );
            },
        );
    });
});
