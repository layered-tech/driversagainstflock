import { Text } from 'react-native';
import { getSearchHighlightRanges } from './search-formatters';

export function HighlightedSearchText({
    children,
    className,
    highlightQuery,
    numberOfLines,
    testID,
}) {
    const text = typeof children === 'string' ? children : '';
    const ranges = getSearchHighlightRanges(text, highlightQuery || '');

    if (!ranges.length) {
        return (
            <Text
                className={className}
                numberOfLines={numberOfLines}
                testID={testID}
            >
                {text}
            </Text>
        );
    }

    const segments = [];
    let cursor = 0;

    ranges.forEach((range, index) => {
        if (range.start > cursor) {
            segments.push({
                highlighted: false,
                key: `plain-${index}`,
                text: text.slice(cursor, range.start),
            });
        }

        segments.push({
            highlighted: true,
            key: `highlight-${index}`,
            text: text.slice(range.start, range.end),
        });
        cursor = range.end;
    });

    if (cursor < text.length) {
        segments.push({
            highlighted: false,
            key: 'plain-tail',
            text: text.slice(cursor),
        });
    }

    return (
        <Text
            className={className}
            numberOfLines={numberOfLines}
            testID={testID}
        >
            {segments.map((segment) => (
                <Text
                    className={
                        segment.highlighted
                            ? 'text-daf-text-brand dark:text-daf-brand'
                            : undefined
                    }
                    key={segment.key}
                >
                    {segment.text}
                </Text>
            ))}
        </Text>
    );
}
