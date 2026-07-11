import { PLACE_SEARCH_MIN_QUERY_LENGTH } from './constants';

const SEARCH_RESULT_FEET_PER_METER = 3.28084;
const SEARCH_RESULT_METERS_PER_MILE = 1609.344;
const SEARCH_RESULT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
});
const SEARCH_RESULT_MILES_FORMATTER = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
});

export function formatSearchResultDistance(distanceMeters) {
    if (
        distanceMeters === null ||
        distanceMeters === undefined ||
        distanceMeters === ''
    ) {
        return '';
    }

    const distance = Number(distanceMeters);

    if (!Number.isFinite(distance) || distance < 0) {
        return '';
    }

    if (distance < 15) {
        return '<50 ft';
    }

    const miles = distance / SEARCH_RESULT_METERS_PER_MILE;

    if (miles < 0.1) {
        const feet = Math.max(
            50,
            Math.round((distance * SEARCH_RESULT_FEET_PER_METER) / 50) * 50,
        );

        return `${SEARCH_RESULT_NUMBER_FORMATTER.format(feet)} ft`;
    }

    if (miles < 10) {
        return `${SEARCH_RESULT_MILES_FORMATTER.format(miles)} mi`;
    }

    return `${SEARCH_RESULT_NUMBER_FORMATTER.format(Math.round(miles))} mi`;
}

function getSearchHighlightTerms(query) {
    const trimmedQuery = String(query ?? '')
        .trim()
        .toLowerCase();
    const terms = [];

    if (trimmedQuery.length >= PLACE_SEARCH_MIN_QUERY_LENGTH) {
        terms.push(trimmedQuery);
    }

    trimmedQuery
        .split(/[\s,]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= PLACE_SEARCH_MIN_QUERY_LENGTH)
        .forEach((term) => {
            if (!terms.includes(term)) {
                terms.push(term);
            }
        });

    return terms.sort(
        (firstTerm, secondTerm) => secondTerm.length - firstTerm.length,
    );
}

export function getSearchHighlightRanges(text, query) {
    const safeText = typeof text === 'string' ? text : '';
    const lowerText = safeText.toLowerCase();
    const ranges = [];

    getSearchHighlightTerms(query).forEach((term) => {
        let searchIndex = 0;

        while (searchIndex < lowerText.length) {
            const matchIndex = lowerText.indexOf(term, searchIndex);

            if (matchIndex === -1) {
                break;
            }

            ranges.push({
                start: matchIndex,
                end: matchIndex + term.length,
            });
            searchIndex = matchIndex + term.length;
        }
    });

    return ranges
        .sort((firstRange, secondRange) => {
            if (firstRange.start !== secondRange.start) {
                return firstRange.start - secondRange.start;
            }

            return secondRange.end - firstRange.end;
        })
        .reduce((mergedRanges, range) => {
            const previousRange = mergedRanges[mergedRanges.length - 1];

            if (previousRange && range.start <= previousRange.end) {
                previousRange.end = Math.max(previousRange.end, range.end);
                return mergedRanges;
            }

            mergedRanges.push({ ...range });
            return mergedRanges;
        }, []);
}
