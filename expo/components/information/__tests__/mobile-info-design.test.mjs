import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
    HELP_AND_LEGAL_DRAWER_ITEMS,
    PRIMARY_DRAWER_ITEMS,
} from '../../root/app-drawer-items.js';
import { faqItems } from '../community-content.js';
import {
    FAQ_FILTERS,
    getLegalDocumentMetadata,
    getLegalSectionScrollOffset,
    getLegalTableOfContents,
    getVisibleFaqItems,
} from '../information-page-state.js';
import { privacyPage } from '../privacy-content.js';
import { termsPage } from '../terms-content.js';

const drawerSource = readFileSync(
    new URL('../../root/app-drawer-content.js', import.meta.url),
    'utf8',
);
const faqScreenSource = readFileSync(
    new URL('../faq-screen.js', import.meta.url),
    'utf8',
);
const contributeScreenSource = readFileSync(
    new URL('../contribute-screen.js', import.meta.url),
    'utf8',
);
const legalScreenSource = readFileSync(
    new URL('../information-screen.js', import.meta.url),
    'utf8',
);
const aboutLegalScreenSource = readFileSync(
    new URL('../about-legal-screen.js', import.meta.url),
    'utf8',
);

describe('Mobile help and legal design', () => {
    test('groups the drawer into primary and help/legal destinations', () => {
        assert.deepEqual(PRIMARY_DRAWER_ITEMS, [
            { icon: 'map', label: 'Map', routeName: 'index' },
            { icon: 'gauge', label: 'Scorecard', routeName: 'scorecard' },
            { icon: 'flame', label: 'Hotlist', routeName: 'hotlist' },
        ]);
        assert.deepEqual(
            HELP_AND_LEGAL_DRAWER_ITEMS.map(({ label, routeName }) => ({
                label,
                routeName,
            })),
            [
                { label: 'FAQ', routeName: 'faqs' },
                { label: 'Support Us', routeName: 'contribute-to-daf' },
                { label: 'Privacy Policy', routeName: 'privacy-policy' },
                { label: 'Terms of Use', routeName: 'terms-of-use' },
                { label: 'About & Legal', routeName: 'about-and-legal' },
            ],
        );
        assert.match(drawerSource, /HELP_AND_LEGAL_DRAWER_ITEMS/);
        assert.match(drawerSource, /testID="drawer-auth-footer-app-version"/);
        assert.doesNotMatch(drawerSource, /Private navigation/);
        assert.doesNotMatch(drawerSource, /DAF \{appVersion\}/);
        assert.match(drawerSource, /className="items-center px-\[22px\] pt-3"/);
        assert.match(drawerSource, /label="Your Edits"/);
        assert.match(drawerSource, /label="Logout"/);
        assert.ok(
            drawerSource.indexOf('label="Your Edits"') <
                drawerSource.indexOf('label="Logout"'),
        );
        assert.ok(
            drawerSource.indexOf('label="Logout"') <
                drawerSource.indexOf(
                    '>\n                            Developer',
                ),
        );
    });

    test('keeps the drawer open while authentication state changes', () => {
        const handleAuthPressSource = drawerSource.match(
            /const handleAuthPress = async \(\) => \{[\s\S]*?\n    \};/,
        )?.[0];

        assert.ok(handleAuthPressSource);
        assert.match(
            handleAuthPressSource,
            /if \(isAuthenticated\) \{\s*await signOut\(\);\s*\} else \{\s*await signInWithOpenStreetMap\(\);\s*\}/,
        );
        assert.doesNotMatch(handleAuthPressSource, /closeDrawer/);
    });

    test('filters FAQ answers by category and the searchable copy', () => {
        assert.deepEqual(
            FAQ_FILTERS.map(({ label }) => label),
            ['All', 'Privacy', 'Camera data', 'Legal'],
        );
        assert.deepEqual(
            getVisibleFaqItems(faqItems, 'privacy', '').map(
                ({ question }) => question,
            ),
            [
                'Is Drivers Against Flock really free?',
                'Do you track me or store my trips?',
            ],
        );
        assert.deepEqual(
            getVisibleFaqItems(faqItems, 'all', 'openstreetmap').map(
                ({ question }) => question,
            ),
            [
                'Where does the camera data come from?',
                'What kinds of cameras does it show?',
                'A camera is missing or in the wrong spot — how do I fix it?',
            ],
        );
        assert.match(faqScreenSource, /getVisibleFaqItems/);
        assert.match(faqScreenSource, /faq-search-input/);
        assert.match(faqScreenSource, /Still stuck\? Email us/);
        assert.match(contributeScreenSource, /What it covers/);
        assert.match(contributeScreenSource, /Opens Buy Me a Coffee in Safari/);
    });

    test('builds concise legal metadata and jump lists from legal content', () => {
        assert.deepEqual(getLegalDocumentMetadata(privacyPage), {
            sectionCountLabel: '12 sections',
            updatedLabel: 'Last updated August 2026',
        });
        assert.deepEqual(getLegalDocumentMetadata(termsPage), {
            sectionCountLabel: '18 sections',
            updatedLabel: 'Effective June 2026',
        });
        assert.equal(termsPage.showIntro, false);
        assert.equal(termsPage.showSummary, false);
        assert.equal(termsPage.tableOfContentsInitiallyOpen, true);
        assert.deepEqual(
            getLegalTableOfContents(termsPage.sections).slice(0, 2),
            [
                {
                    id: 'about',
                    number: '01',
                    title: 'About Drivers Against Flock',
                },
                { id: 'eligibility', number: '02', title: 'Eligibility' },
            ],
        );
        assert.match(legalScreenSource, /Jump to a section/);
        assert.match(legalScreenSource, /legal-table-of-contents/);
        assert.match(legalScreenSource, /InformationHeader onShare/);
        assert.match(
            legalScreenSource,
            /import \{ useRef, useState \} from 'react'/,
        );
        assert.match(
            legalScreenSource,
            /Promise\.resolve\(\)[\s\S]*Share\.share/,
        );
    });

    test('translates nested legal section coordinates into scroll coordinates', () => {
        assert.equal(getLegalSectionScrollOffset(480, 125), 605);
        assert.equal(getLegalSectionScrollOffset(0, 0), 0);
        assert.equal(getLegalSectionScrollOffset(undefined, 125), null);
        assert.equal(getLegalSectionScrollOffset(480, Number.NaN), null);
        assert.match(legalScreenSource, /sectionsContainerOffsetRef/);
    });

    test('omits the open-source licenses item from About & Legal', () => {
        assert.match(aboutLegalScreenSource, /title="Privacy Policy"/);
        assert.match(aboutLegalScreenSource, /title="Terms of Use"/);
        assert.doesNotMatch(aboutLegalScreenSource, /Open-source licenses/);
        assert.doesNotMatch(aboutLegalScreenSource, /Linking/);
    });
});
