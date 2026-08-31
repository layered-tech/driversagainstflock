export const FAQ_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'camera-data', label: 'Camera data' },
    { id: 'legal', label: 'Legal' },
];

const FAQ_CATEGORY_IDS_BY_QUESTION = {
    'A camera is missing or in the wrong spot — how do I fix it?': [
        'camera-data',
    ],
    'Do you track me or store my trips?': ['privacy'],
    'Is Drivers Against Flock really free?': ['privacy'],
    'Is it legal to use?': ['legal'],
    'What kinds of cameras does it show?': ['camera-data'],
    'Where does the camera data come from?': ['camera-data'],
};

function normalizeSearchText(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase();
}

export function getVisibleFaqItems(faqs, activeFilterId, searchQuery) {
    const normalizedQuery = normalizeSearchText(searchQuery);

    return faqs.filter((faq) => {
        const matchesCategory =
            activeFilterId === 'all' ||
            (FAQ_CATEGORY_IDS_BY_QUESTION[faq.question] ?? []).includes(
                activeFilterId,
            );
        const matchesSearch =
            normalizedQuery.length === 0 ||
            normalizeSearchText(faq.question).includes(normalizedQuery) ||
            normalizeSearchText(faq.answer).includes(normalizedQuery);

        return matchesCategory && matchesSearch;
    });
}

export function getLegalTableOfContents(sections) {
    return sections.map((section, index) => ({
        id: section.id,
        number: String(index + 1).padStart(2, '0'),
        title: section.title.replace(/^\d+\.\s*/, ''),
    }));
}

export function getLegalDocumentMetadata(page) {
    return {
        sectionCountLabel: `${page.sections.length} sections`,
        updatedLabel: page.badgeLabels[0],
    };
}

export function getLegalSectionScrollOffset(
    sectionsContainerOffset,
    sectionOffset,
) {
    if (
        !Number.isFinite(sectionsContainerOffset) ||
        !Number.isFinite(sectionOffset)
    ) {
        return null;
    }

    return Math.max(0, sectionsContainerOffset + sectionOffset);
}
