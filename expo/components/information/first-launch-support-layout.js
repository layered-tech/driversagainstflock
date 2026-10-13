const designSizes = [
    4, 6, 8, 9, 11, 12, 13, 14, 15, 16, 17, 17.55, 18, 19, 20, 22, 22.5, 25.5,
    28, 32, 36.8, 46, 52, 58,
];

export function getFirstLaunchSupportLayout(windowWidth, insets) {
    const width = Math.min(windowWidth, 560);
    const scale = width / 390;

    return {
        scale,
        paddingTop: Math.max(insets.top + 24 * scale, 68 * scale),
        paddingBottom: Math.max(insets.bottom + 16 * scale, 36 * scale),
        variables: {
            ...Object.fromEntries(
                designSizes.map((size) => [
                    `--support-${String(size).replace('.', '-')}`,
                    size * scale,
                ]),
            ),
            '--support-heading-tracking': -0.384 * scale,
            '--support-cost-tracking': -0.56 * scale,
        },
    };
}
