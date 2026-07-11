import React from 'react';
import { Icon } from './Icon/Icon';

const TONES = {
    info: { icon: 'info', fg: 'var(--azure-600)', bg: 'var(--azure-100)' },
    success: {
        icon: 'circle-check',
        fg: 'var(--green-700)',
        bg: 'var(--green-050)',
    },
    warning: {
        icon: 'triangle-alert',
        fg: 'var(--amber-600)',
        bg: 'var(--amber-100)',
    },
    alert: {
        icon: 'triangle-alert',
        fg: 'var(--alert-600)',
        bg: 'var(--alert-100)',
    },
};

/**
 * DAF Toast — transient notification ("Re-routed to avoid 2 cameras",
 * "Offline maps updated"). Frosted card with a tinted status chip, optional
 * description + inline action, and a dismiss control. Drop them into a
 * <ToastViewport> to stack in a screen corner.
 */
export function Toast({
    tone = 'info', // info | success | warning | alert
    title,
    description,
    action, // { label, onClick }
    onDismiss,
    icon, // override the tone's default icon name
    style = {},
    ...rest
}) {
    const t = TONES[tone] || TONES.info;
    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                width: 360,
                maxWidth: 'calc(100vw - 32px)',
                padding: 14,
                background: 'var(--surface-glass-2)',
                border: '1px solid var(--border-glass)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-float)',
                backdropFilter: 'blur(var(--blur-glass))',
                WebkitBackdropFilter: 'blur(var(--blur-glass))',
                color: 'var(--text-primary)',
                pointerEvents: 'auto',
                ...style,
            }}
            {...rest}
        >
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    flex: '0 0 auto',
                    borderRadius: 'var(--radius-sm)',
                    background: t.bg,
                    color: t.fg,
                }}
            >
                <Icon name={icon || t.icon} size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                {title && (
                    <div
                        style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: 'var(--fs-body)',
                            fontWeight: 'var(--fw-semibold)',
                            color: 'var(--text-primary)',
                            lineHeight: 1.35,
                        }}
                    >
                        {title}
                    </div>
                )}
                {description && (
                    <div
                        style={{
                            fontFamily: 'var(--font-ui)',
                            fontSize: 'var(--fs-body-sm)',
                            color: 'var(--text-secondary)',
                            marginTop: 2,
                            lineHeight: 1.45,
                            textWrap: 'pretty',
                        }}
                    >
                        {description}
                    </div>
                )}
                {action && (
                    <button
                        onClick={action.onClick}
                        style={{
                            marginTop: 10,
                            padding: 0,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-brand)',
                            fontFamily: 'var(--font-ui)',
                            fontSize: 'var(--fs-body-sm)',
                            fontWeight: 'var(--fw-semibold)',
                            cursor: 'pointer',
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        {action.label}
                    </button>
                )}
            </div>
            {onDismiss && (
                <button
                    aria-label="Dismiss"
                    onClick={onDismiss}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 26,
                        height: 26,
                        flex: '0 0 auto',
                        marginTop: -1,
                        marginRight: -2,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        borderRadius: '50%',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                >
                    <Icon name="x" size={16} />
                </button>
            )}
        </div>
    );
}

/**
 * Fixed-position stack for Toasts. Place once near the app root and render
 * your active toasts as children.
 */
export function ToastViewport({
    children,
    placement = 'bottom-right', // top|bottom + -left|-center|-right
    style = {},
}) {
    const vy = placement.startsWith('top') ? 'top' : 'bottom';
    const hx = placement.endsWith('left')
        ? 'left'
        : placement.endsWith('center')
          ? 'center'
          : 'right';
    const pos = {
        position: 'fixed',
        zIndex: 60,
        display: 'flex',
        flexDirection: vy === 'top' ? 'column' : 'column-reverse',
        gap: 10,
        padding: 16,
        pointerEvents: 'none',
        [vy]: 0,
    };
    if (hx === 'left') pos.left = 0;
    else if (hx === 'right') pos.right = 0;
    else {
        pos.left = '50%';
        pos.transform = 'translateX(-50%)';
        pos.alignItems = 'center';
    }

    return <div style={{ ...pos, ...style }}>{children}</div>;
}
