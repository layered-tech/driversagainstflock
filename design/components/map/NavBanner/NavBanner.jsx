import React from 'react';
import { Icon } from '../../core/Icon/Icon';

/* Maneuver → Lucide icon */
const MANEUVERS = {
    left: 'corner-up-left',
    right: 'corner-up-right',
    straight: 'arrow-up',
    'sharp-left': 'corner-up-left',
    'sharp-right': 'corner-up-right',
    uturn: 'undo-2',
    merge: 'git-merge',
    exit: 'corner-up-right',
    arrive: 'flag',
};

/**
 * DAF NavBanner — turn-by-turn instruction banner for active navigation.
 * Calm, high-contrast, large maneuver arrow. Pins to the top of the screen.
 */
export function NavBanner({
    maneuver = 'right',
    distance = '500 ft',
    instruction = 'Turn right onto Market St',
    then = null,
    style = {},
}) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--surface-glass-2)',
                border: '1px solid var(--border-glass)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-float)',
                backdropFilter: 'blur(var(--blur-glass))',
                WebkitBackdropFilter: 'blur(var(--blur-glass))',
                ...style,
            }}
        >
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 52,
                    height: 52,
                    flex: '0 0 auto',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--brand)',
                    color: 'var(--brand-contrast)',
                }}
            >
                <Icon
                    name={MANEUVERS[maneuver] || MANEUVERS.right}
                    size={30}
                    stroke={2.4}
                />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
                <span
                    style={{
                        display: 'block',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--fs-h2)',
                        fontWeight: 'var(--fw-bold)',
                        color: 'var(--text-primary)',
                        lineHeight: 1.05,
                        fontFeatureSettings: 'var(--num-feature)',
                    }}
                >
                    {distance}
                </span>
                <span
                    style={{
                        display: 'block',
                        fontFamily: 'var(--font-ui)',
                        fontSize: 'var(--fs-body-lg)',
                        fontWeight: 'var(--fw-medium)',
                        color: 'var(--text-secondary)',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}
                >
                    {instruction}
                </span>
            </span>
            {then && (
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        flex: '0 0 auto',
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-pill)',
                        background: 'var(--surface-card-alt)',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-ui)',
                        fontSize: 'var(--fs-body-sm)',
                        fontWeight: 'var(--fw-semibold)',
                    }}
                >
                    {then}
                </span>
            )}
        </div>
    );
}
