import React from 'react';
import { Icon } from '../../core/Icon/Icon';

/* Mini route-line swatch — solid green (private) vs solid azure (fast).
   Both are solid lines; the two read apart by color + icon + label. */
function RouteSwatch({ kind }) {
    const color =
        kind === 'private' ? 'var(--route-private)' : 'var(--route-fast)';
    return (
        <svg viewBox="0 0 40 12" width={40} height={12} aria-hidden>
            <line
                x1="2"
                y1="6"
                x2="38"
                y2="6"
                stroke="#fff"
                strokeWidth="9"
                strokeLinecap="round"
            />
            <line
                x1="2"
                y1="6"
                x2="38"
                y2="6"
                stroke={color}
                strokeWidth="6"
                strokeLinecap="round"
            />
        </svg>
    );
}

/**
 * DAF RouteCard — one selectable route option in the route-comparison sheet.
 * Fastest (solid azure + bolt) vs Private (solid green + shield) — both solid
 * lines, told apart by color + icon + label.
 */
export function RouteCard({
    kind = 'fast', // fast | private
    eta, // "24 min"
    arrival, // "arrive 6:12"
    distance, // "12.4 mi"
    cameras = 0, // ALPR count on this route
    selected = false,
    recommended = false,
    onClick,
    style = {},
}) {
    const isPrivate = kind === 'private';
    const accent = isPrivate ? 'var(--route-private)' : 'var(--route-fast)';
    const title = isPrivate ? 'Private route' : 'Fastest route';
    const glyph = isPrivate ? 'shield-check' : 'zap';

    return (
        <button
            onClick={onClick}
            aria-pressed={selected}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                textAlign: 'left',
                padding: 'var(--space-3)',
                background: 'var(--surface-glass)',
                border: `1.5px solid ${selected ? accent : 'var(--border-glass)'}`,
                borderRadius: 'var(--radius-md)',
                boxShadow: selected
                    ? `0 0 0 3px ${isPrivate ? 'rgba(31,191,107,0.18)' : 'rgba(46,139,255,0.18)'}, var(--shadow-float)`
                    : 'var(--shadow-float)',
                backdropFilter: 'blur(var(--blur-glass))',
                WebkitBackdropFilter: 'blur(var(--blur-glass))',
                cursor: 'pointer',
                transition:
                    'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
                WebkitTapHighlightColor: 'transparent',
                ...style,
            }}
        >
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 42,
                    height: 42,
                    flex: '0 0 auto',
                    borderRadius: 'var(--radius-sm)',
                    background: isPrivate
                        ? 'rgba(31,191,107,0.16)'
                        : 'rgba(46,139,255,0.16)',
                    color: accent,
                }}
            >
                <Icon name={glyph} size={22} />
            </span>

            <span style={{ flex: 1, minWidth: 0 }}>
                <span
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 3,
                    }}
                >
                    <span
                        style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: 'var(--fs-body)',
                            fontWeight: 'var(--fw-bold)',
                            color: 'var(--text-primary)',
                        }}
                    >
                        {title}
                    </span>
                    {recommended && (
                        <span
                            style={{
                                fontFamily: 'var(--font-ui)',
                                fontSize: 'var(--fs-label)',
                                fontWeight: 'var(--fw-bold)',
                                letterSpacing: 'var(--ls-label)',
                                textTransform: 'uppercase',
                                color: 'var(--brand-contrast)',
                                background: 'var(--brand)',
                                padding: '2px 7px',
                                borderRadius: 'var(--radius-pill)',
                            }}
                        >
                            Pick
                        </span>
                    )}
                </span>
                <span
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontFamily: 'var(--font-ui)',
                        fontSize: 'var(--fs-body-sm)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <RouteSwatch kind={kind} />
                    <span>{distance}</span>
                    <span aria-hidden style={{ opacity: 0.4 }}>
                        ·
                    </span>
                    <span
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            color:
                                cameras === 0
                                    ? 'var(--text-brand)'
                                    : 'var(--alert-500)',
                            fontWeight: 'var(--fw-semibold)',
                        }}
                    >
                        <Icon
                            name={cameras === 0 ? 'check' : 'scan-eye'}
                            size={14}
                        />
                        {cameras === 0
                            ? 'No cameras'
                            : `${cameras} camera${cameras > 1 ? 's' : ''}`}
                    </span>
                </span>
            </span>

            <span style={{ textAlign: 'right', flex: '0 0 auto' }}>
                <span
                    style={{
                        display: 'block',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--fs-h3)',
                        fontWeight: 'var(--fw-bold)',
                        color: 'var(--text-primary)',
                        lineHeight: 1.1,
                        fontFeatureSettings: 'var(--num-feature)',
                    }}
                >
                    {eta}
                </span>
                <span
                    style={{
                        display: 'block',
                        fontFamily: 'var(--font-ui)',
                        fontSize: 'var(--fs-caption)',
                        color: 'var(--text-tertiary)',
                    }}
                >
                    {arrival}
                </span>
            </span>
        </button>
    );
}
