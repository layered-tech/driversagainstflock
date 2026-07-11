import React from 'react';
import { Icon } from './Icon/Icon';
import { Button } from './Button/Button';

const ICON_TONES = {
    brand: { bg: 'var(--brand-soft)', fg: 'var(--text-brand)' },
    alert: { bg: 'var(--alert-100)', fg: 'var(--alert-600)' },
    warning: { bg: 'var(--amber-100)', fg: 'var(--amber-600)' },
    info: { bg: 'var(--azure-100)', fg: 'var(--azure-600)' },
};

/**
 * DAF Dialog — modal surface for focused tasks (route options, place
 * details, settings). Dimmed, blurred scrim over the map; a raised panel
 * with the modal-shell radius. Optional tinted icon, title, description,
 * body and a right-aligned footer for actions.
 */
export function Dialog({
    open = true,
    onClose,
    title,
    description,
    children,
    footer,
    icon, // icon name; renders a tinted chip
    tone = 'brand', // chip tone: brand | alert | warning | info
    size = 'md', // sm | md | lg
    dismissable = true, // click scrim / show close button
    style = {},
}) {
    if (!open) return null;
    const widths = { sm: 380, md: 460, lg: 560 };
    const it = ICON_TONES[tone] || ICON_TONES.brand;

    return (
        <div
            role="dialog"
            aria-modal="true"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
            }}
        >
            <div
                onClick={dismissable ? onClose : undefined}
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(11,14,18,0.55)',
                    backdropFilter: 'blur(var(--blur-soft))',
                    WebkitBackdropFilter: 'blur(var(--blur-soft))',
                }}
            />
            <div
                style={{
                    position: 'relative',
                    width: widths[size] || widths.md,
                    maxWidth: '100%',
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-2xl)',
                    boxShadow: 'var(--shadow-sheet)',
                    padding: 'var(--space-6)',
                    color: 'var(--text-primary)',
                    ...style,
                }}
            >
                {dismissable && onClose && (
                    <button
                        aria-label="Close"
                        onClick={onClose}
                        style={{
                            position: 'absolute',
                            top: 16,
                            right: 16,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 32,
                            height: 32,
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-tertiary)',
                            cursor: 'pointer',
                            borderRadius: '50%',
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        <Icon name="x" size={18} />
                    </button>
                )}
                {icon && (
                    <span
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 44,
                            height: 44,
                            marginBottom: 14,
                            borderRadius: 'var(--radius-md)',
                            background: it.bg,
                            color: it.fg,
                        }}
                    >
                        <Icon name={icon} size={22} />
                    </span>
                )}
                {title && (
                    <h2
                        style={{
                            margin: 0,
                            fontFamily: 'var(--font-display)',
                            fontSize: 'var(--fs-h3)',
                            lineHeight: 'var(--lh-h3)',
                            fontWeight: 'var(--fw-bold)',
                            letterSpacing: 'var(--ls-heading)',
                            color: 'var(--text-primary)',
                            paddingRight: dismissable && onClose ? 36 : 0,
                        }}
                    >
                        {title}
                    </h2>
                )}
                {description && (
                    <p
                        style={{
                            margin: '8px 0 0',
                            fontFamily: 'var(--font-ui)',
                            fontSize: 'var(--fs-body)',
                            lineHeight: 'var(--lh-body)',
                            color: 'var(--text-secondary)',
                            textWrap: 'pretty',
                        }}
                    >
                        {description}
                    </p>
                )}
                {children && <div style={{ marginTop: 18 }}>{children}</div>}
                {footer && (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 10,
                            marginTop: 'var(--space-6)',
                        }}
                    >
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * DAF AlertDialog — confirmation modal that demands an explicit choice. Not
 * scrim-dismissable; renders Cancel + Confirm. Set `destructive` for
 * irreversible actions (red confirm, alert icon).
 */
export function AlertDialog({
    open = true,
    onCancel,
    onConfirm,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    icon,
    style = {},
}) {
    return (
        <Dialog
            open={open}
            onClose={onCancel}
            dismissable={false}
            size="sm"
            icon={icon || (destructive ? 'triangle-alert' : 'info')}
            tone={destructive ? 'alert' : 'info'}
            title={title}
            description={description}
            style={style}
            footer={
                <>
                    <Button variant="ghost" onClick={onCancel}>
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={destructive ? 'danger' : 'primary'}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </Button>
                </>
            }
        />
    );
}
