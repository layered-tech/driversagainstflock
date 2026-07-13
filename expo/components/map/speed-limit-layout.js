export const SPEED_LIMIT_BADGE_SIZES = Object.freeze({
    sm: 44,
    md: 58,
    lg: 80,
});

export const MOBILE_SPEED_LIMIT_BADGE_SIZE = 'lg';
export const AUTO_PLAY_SPEED_LIMIT_BADGE_SIZE = 62;

export function getSpeedLimitBadgeLayout(size = 'md') {
    const namedSize = SPEED_LIMIT_BADGE_SIZES[size];
    const signWidth =
        typeof size === 'number' && Number.isFinite(size) && size > 0
            ? size
            : (namedSize ?? SPEED_LIMIT_BADGE_SIZES.md);
    const signHeight = signWidth * 1.2;
    const signBorderWidth = Math.max(2, signWidth * 0.045);
    const currentSpeedContentDiameter = signWidth * 0.46;
    const currentSpeedBorderWidth = Math.max(3, signWidth * 0.07);
    const currentSpeedDiameter =
        currentSpeedContentDiameter + currentSpeedBorderWidth * 2;
    const currentSpeedCornerOverhang = currentSpeedContentDiameter / 2;
    const labelFontSize = signWidth * 0.15;
    const valueFontSize = signWidth * 0.46;

    return {
        containerHeight: signHeight + currentSpeedCornerOverhang,
        containerWidth: signWidth,
        currentSpeedBorderWidth,
        currentSpeedContentDiameter,
        currentSpeedCornerOverhang,
        currentSpeedDiameter,
        currentSpeedFontSize: currentSpeedContentDiameter * 0.46,
        labelFontSize,
        labelLetterSpacing: labelFontSize * 0.04,
        labelLineHeight: labelFontSize * 1.02,
        signBorderRadius: signWidth * 0.14,
        signBorderWidth,
        signContentGap: signWidth * 0.04,
        signHeight,
        signOuterHeight: signHeight + signBorderWidth * 2,
        signOuterWidth: signWidth + signBorderWidth * 2,
        signWidth,
        valueFontSize,
        valueLineHeight: valueFontSize * 0.92,
    };
}
