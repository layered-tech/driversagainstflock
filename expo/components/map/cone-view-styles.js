export const CONE_VIEW_STYLES = [
    { value: 'flat', label: 'Current' },
    { value: 'beam', label: 'Soft beam' },
    { value: 'volume', label: 'Rounded volume' },
    { value: 'faceted', label: 'Faceted volume' },
];

export function coneImageName(imageName, variant = 'flat') {
    return variant === 'flat' ? imageName : `${imageName}-${variant}`;
}

export function coneImageExpression(zoomStyles, variant = 'flat') {
    return [
        'step',
        ['zoom'],
        coneImageName(zoomStyles[0].imageName, variant),
        ...zoomStyles
            .slice(1)
            .flatMap(({ minZoom, imageName }) => [
                minZoom,
                coneImageName(imageName, variant),
            ]),
    ];
}
