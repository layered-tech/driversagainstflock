export function getContributeTourLayout({
    target,
    viewport,
    insets,
    tooltipHeight = 230,
    origin = { x: 0, y: 0 },
}) {
    const left = Math.max(0, target.x - origin.x - 6);
    const top = Math.max(0, target.y - origin.y - 6);
    const right = Math.min(
        viewport.width,
        target.x - origin.x + target.width + 6,
    );
    const bottom = Math.min(
        viewport.height,
        target.y - origin.y + target.height + 6,
    );

    if (right <= left || bottom <= top) {
        return null;
    }

    const highlight = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    };
    const safeTop = insets.top + 16;
    const safeBottom = viewport.height - insets.bottom - 16;
    const above = top - safeTop - 18;
    const below = safeBottom - bottom - 18;
    let placement =
        below >= tooltipHeight || below >= above ? 'below' : 'above';
    const width = Math.min(
        360,
        viewport.width - insets.left - insets.right - 32,
    );
    let maxHeight = Math.max(0, placement === 'below' ? below : above);
    if (maxHeight < 120) {
        placement = 'floating';
        maxHeight = Math.min(230, safeBottom - safeTop);
    }
    const height = Math.min(tooltipHeight, maxHeight);
    const x = Math.max(
        insets.left + 16,
        Math.min(
            left + highlight.width / 2 - width / 2,
            viewport.width - insets.right - 16 - width,
        ),
    );
    const y =
        placement === 'below'
            ? bottom + 18
            : placement === 'floating'
              ? safeBottom - height
              : top - height - 18;

    return {
        highlight,
        tooltip: { x, y, width, maxHeight },
        placement,
        arrowX: Math.max(
            16,
            Math.min(width - 36, left + highlight.width / 2 - x - 10),
        ),
    };
}

export function getContributeTourBackdropPath(viewport, highlight) {
    const { x, y, width, height } = highlight;
    const radius = Math.min(12, width / 2, height / 2);

    return (
        `M0 0H${viewport.width}V${viewport.height}H0Z ` +
        `M${x + radius} ${y}H${x + width - radius}Q${x + width} ${y} ${x + width} ${y + radius}` +
        `V${y + height - radius}Q${x + width} ${y + height} ${x + width - radius} ${y + height}` +
        `H${x + radius}Q${x} ${y + height} ${x} ${y + height - radius}` +
        `V${y + radius}Q${x} ${y} ${x + radius} ${y}Z`
    );
}
