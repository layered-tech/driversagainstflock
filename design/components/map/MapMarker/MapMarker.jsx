import React from 'react';
import { Icon } from '../../core/Icon/Icon';

/* ~40°-wide pie-slice "cone of view", apex at the dot centre, aimed up by
   default and rotated to `heading`. Fades from solid at the apex to
   transparent at the far edge — large relative to the dot it springs from. */
function Cone({ heading = 0, fill, edge, size = 132 }) {
    const gid = React.useId().replace(/[:]/g, '');
    // viewBox 100×100, centre (50,50). Up = -90°, half-angle 20° → edges at -110°/-70°.
    const d = 'M50 50 L34.3 6.8 A46 46 0 0 1 65.7 6.8 Z';
    return (
        <svg
            viewBox="0 0 100 100"
            width={size}
            height={size}
            style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(-50%,-50%) rotate(${heading}deg)`,
                pointerEvents: 'none',
                overflow: 'visible',
            }}
        >
            <defs>
                <radialGradient id={`cone-${gid}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={fill} stopOpacity="0.95" />
                    <stop offset="55%" stopColor={fill} stopOpacity="0.55" />
                    <stop offset="100%" stopColor={fill} stopOpacity="0.04" />
                </radialGradient>
            </defs>
            <path
                d={d}
                fill={`url(#cone-${gid})`}
                stroke={edge}
                strokeWidth="0.9"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/* Bottom-center anchored teardrop pin with a large, centered glyph in its head. */
function Pin({ fill, ink, iconName, icon, size = 46 }) {
    const headIcon =
        icon ||
        (iconName ? (
            <Icon name={iconName} size={size * 0.48} color={ink} />
        ) : null);
    return (
        <span
            style={{
                position: 'relative',
                display: 'inline-block',
                width: size,
                height: size * 1.32,
            }}
        >
            <svg
                viewBox="0 0 44 58"
                width={size}
                height={size * 1.32}
                style={{
                    filter: 'drop-shadow(0 4px 8px rgba(11,14,18,0.4))',
                    display: 'block',
                }}
            >
                <path
                    d="M22 1C10.7 1 1.5 10.1 1.5 21.4 1.5 36.5 22 57 22 57s20.5-20.5 20.5-35.6C42.5 10.1 33.3 1 22 1Z"
                    fill={fill}
                    stroke="var(--surface-marker)"
                    strokeWidth="2"
                />
            </svg>
            <span
                style={{
                    position: 'absolute',
                    top: `${(22 / 58) * 100}%`,
                    left: '50%',
                    transform: 'translate(-50%,-50%)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: ink,
                }}
            >
                {headIcon}
            </span>
        </span>
    );
}

/**
 * DAF MapMarker — the full surveillance / navigation marker family.
 * variants: user | place | destination | alpr | camera | cluster | monitored
 *          | police | police-hidden
 *
 * ALPR/camera are small glowing dots; `camera` carries a large ~40° cone of
 * view aimed at `heading`. Place & destination are teardrop pins with a large,
 * vertically-centered glyph in the head. Police / hidden-police are live
 * Waze-sourced reports: a solid blue glowing dot, and a dashed blue ring for
 * hidden (unconfirmed-position) police. Both carry a shield glyph — solid
 * blue badge for police, dashed outline ring for hidden.
 */
export function MapMarker({
    variant = 'place',
    icon = null, // custom glyph node (place/destination)
    iconName = null, // or a DAF Icon name
    count = 0, // cluster
    heading = 0, // cone / heading direction (deg, 0 = up)
    selected = false,
    inactive = false,
    label = null,
    style = {},
}) {
    const dim = inactive ? 0.45 : 1;
    const scale = selected ? 1.14 : 1;

    let node;
    if (variant === 'user') {
        node = (
            <span
                style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 64,
                    height: 64,
                }}
            >
                <span
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: 'var(--marker-user-halo)',
                    }}
                />
                <Cone
                    heading={heading}
                    fill="var(--marker-user-cone)"
                    edge="var(--marker-user-cone-edge)"
                    size={84}
                />
                <span
                    style={{
                        position: 'relative',
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'var(--marker-user)',
                        border: '3px solid var(--surface-marker)',
                        boxShadow: 'var(--shadow-marker)',
                    }}
                />
            </span>
        );
    } else if (variant === 'alpr' || variant === 'camera') {
        const dot = 15;
        node = (
            <span
                style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 132,
                    height: 132,
                }}
            >
                {variant === 'camera' && (
                    <Cone
                        heading={heading}
                        fill="var(--marker-cone-edge)"
                        edge="var(--marker-cone-edge)"
                        size={132}
                    />
                )}
                {/* soft glow */}
                <span
                    style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%,-50%)',
                        width: dot * 2.6,
                        height: dot * 2.6,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, var(--marker-alpr-glow) 0%, transparent 70%)`,
                        pointerEvents: 'none',
                    }}
                />
                {/* dot */}
                <span
                    style={{
                        position: 'relative',
                        width: dot,
                        height: dot,
                        borderRadius: '50%',
                        background: 'var(--marker-alpr)',
                        border: `${selected ? 3 : 2}px solid #fff`,
                        boxShadow: '0 1px 4px rgba(11,14,18,0.5)',
                    }}
                >
                    <span
                        style={{
                            position: 'absolute',
                            inset: '24%',
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.55)',
                        }}
                    />
                </span>
            </span>
        );
    } else if (variant === 'police' || variant === 'police-hidden') {
        const hidden = variant === 'police-hidden';
        const badge = 26;
        node = (
            <span
                style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 132,
                    height: 132,
                }}
            >
                {/* soft glow */}
                <span
                    style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: 'translate(-50%,-50%)',
                        width: badge * 2.2,
                        height: badge * 2.2,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, var(--marker-police-glow) 0%, transparent 70%)`,
                        opacity: hidden ? 0.55 : 1,
                        pointerEvents: 'none',
                    }}
                />
                {hidden ? (
                    <span
                        style={{
                            position: 'relative',
                            boxSizing: 'border-box',
                            width: badge + 2,
                            height: badge + 2,
                            borderRadius: '50%',
                            background: 'var(--surface-marker)',
                            border: '2px dashed var(--marker-police)',
                            boxShadow: '0 1px 4px rgba(11,14,18,0.5)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--marker-police)',
                        }}
                    >
                        <Icon name="shield" size={14} stroke={2.4} />
                    </span>
                ) : (
                    <span
                        style={{
                            position: 'relative',
                            boxSizing: 'border-box',
                            width: badge,
                            height: badge,
                            borderRadius: '50%',
                            background: 'var(--marker-police)',
                            border: `${selected ? 3 : 2}px solid #fff`,
                            boxShadow: '0 1px 4px rgba(11,14,18,0.5)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                        }}
                    >
                        <Icon name="shield" size={13} stroke={2.6} />
                    </span>
                )}
            </span>
        );
    } else if (variant === 'cluster') {
        node = (
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'var(--alert-500)',
                    border: '3px solid #fff',
                    color: '#fff',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: 15,
                    boxShadow: selected
                        ? '0 0 0 4px rgba(255,77,79,0.35), var(--shadow-marker)'
                        : 'var(--shadow-marker)',
                }}
            >
                {count}
            </span>
        );
    } else if (variant === 'monitored') {
        node = (
            <span
                style={{
                    display: 'inline-flex',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'var(--surface-marker)',
                    border: '4px solid var(--node-monitored)',
                    boxShadow: 'var(--shadow-marker)',
                }}
            />
        );
    } else if (variant === 'destination') {
        node = (
            <Pin
                fill="var(--marker-destination)"
                ink="#fff"
                icon={icon}
                iconName={iconName || 'flag'}
            />
        );
    } else {
        // place
        node = (
            <Pin
                fill="var(--marker-place)"
                ink="var(--marker-place-ink)"
                icon={icon}
                iconName={iconName || 'star'}
            />
        );
    }

    const ringWrap =
        selected && (variant === 'place' || variant === 'destination')
            ? { filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' }
            : {};

    return (
        <span
            style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                opacity: dim,
                transform: `scale(${scale})`,
                transformOrigin: 'bottom center',
                transition:
                    'transform var(--dur-base) var(--ease-soft), opacity var(--dur-base) var(--ease-standard)',
                ...ringWrap,
                ...style,
            }}
        >
            {node}
            {label && (
                <span
                    style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: 'var(--fs-label)',
                        fontWeight: 'var(--fw-bold)',
                        letterSpacing: 'var(--ls-label)',
                        textTransform: 'uppercase',
                        color: 'var(--text-primary)',
                        background: 'var(--surface-glass-2)',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-xs)',
                        whiteSpace: 'nowrap',
                        backdropFilter: 'blur(var(--blur-soft))',
                    }}
                >
                    {label}
                </span>
            )}
        </span>
    );
}
