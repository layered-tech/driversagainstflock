/* @ds-bundle: {"format":4,"namespace":"DesignSystem_c71fad","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button/Button.jsx"},{"name":"ButtonGroup","sourcePath":"components/core/ButtonGroup.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Checkbox","sourcePath":"components/core/Checkbox.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Combobox","sourcePath":"components/core/Combobox.jsx"},{"name":"Dialog","sourcePath":"components/core/Dialog.jsx"},{"name":"AlertDialog","sourcePath":"components/core/Dialog.jsx"},{"name":"Icon","sourcePath":"components/core/Icon/Icon.jsx"},{"name":"ICON_NAMES","sourcePath":"components/core/Icon/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"RadioGroup","sourcePath":"components/core/RadioGroup.jsx"},{"name":"SegmentedControl","sourcePath":"components/core/SegmentedControl.jsx"},{"name":"Slider","sourcePath":"components/core/Slider.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"Toast","sourcePath":"components/core/Toast.jsx"},{"name":"ToastViewport","sourcePath":"components/core/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/core/Tooltip.jsx"},{"name":"BottomSheet","sourcePath":"components/map/BottomSheet/BottomSheet.jsx"},{"name":"MapMarker","sourcePath":"components/map/MapMarker/MapMarker.jsx"},{"name":"NavBanner","sourcePath":"components/map/NavBanner/NavBanner.jsx"},{"name":"RouteCard","sourcePath":"components/map/RouteCard/RouteCard.jsx"},{"name":"SearchBar","sourcePath":"components/map/SearchBar/SearchBar.jsx"},{"name":"SpeedLimitBadge","sourcePath":"components/map/SpeedLimitBadge/SpeedLimitBadge.jsx"},{"name":"SiteHeader","sourcePath":"components/site/SiteHeader.jsx"}],"sourceHashes":{"android-frame.jsx":"70c8c3059eeb","components/core/Badge.jsx":"aec8043bf292","components/core/Button/Button.jsx":"3fc7a05471fc","components/core/ButtonGroup.jsx":"a959108d330e","components/core/Card.jsx":"27fa6350f777","components/core/Checkbox.jsx":"45c1b9869596","components/core/Chip.jsx":"c7bdccdf6932","components/core/Combobox.jsx":"33c6be554065","components/core/Dialog.jsx":"2f42022a577e","components/core/Icon/Icon.jsx":"0e7bcabf00b4","components/core/IconButton.jsx":"f0e6c7b2b661","components/core/Input.jsx":"fa5f6d100763","components/core/RadioGroup.jsx":"2921dd3fac79","components/core/SegmentedControl.jsx":"409c052009f7","components/core/Slider.jsx":"3fbc8e943629","components/core/Switch.jsx":"2ae0cf17b3ed","components/core/Toast.jsx":"e44189257d82","components/core/Tooltip.jsx":"ddb5700c0e39","components/map/BottomSheet/BottomSheet.jsx":"8b86950b4d9a","components/map/MapMarker/MapMarker.jsx":"88b029ffbd3d","components/map/NavBanner/NavBanner.jsx":"0ad861b16637","components/map/RouteCard/RouteCard.jsx":"ec060549923d","components/map/SearchBar/SearchBar.jsx":"a8ff32b73eb1","components/map/SpeedLimitBadge/SpeedLimitBadge.jsx":"ac74a16e2570","components/site/SiteHeader.jsx":"9198a512cc67","ios-frame.jsx":"be3343be4b51"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DesignSystem_c71fad = window.DesignSystem_c71fad || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// android-frame.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// Android.jsx — Simplified Android (Material 3) device frame
// Status bar + top app bar + content + gesture nav + keyboard.
// Based on Figma M3 spec. No dependencies, no image assets.
// Exports (to window): AndroidDevice, AndroidStatusBar, AndroidAppBar, AndroidListItem, AndroidNavBar, AndroidKeyboard
//
// Usage — wrap your screen content in <AndroidDevice> to get the bezel, status
// bar and gesture nav (props: title, large, keyboard, dark):
//
//   <AndroidDevice title="Inbox" large>
//     ...your screen content...
//   </AndroidDevice>
//   <AndroidDevice title="Compose" keyboard>…</AndroidDevice>
/* END USAGE */

const MD_C = {
  surface: '#f4fbf8',
  surfaceVariant: '#dae5e1',
  inverseOnSurface: '#ecf2ef',
  secondaryContainer: '#cde8e1',
  primaryFixedDim: '#83d5c6',
  onSurface: '#171d1b',
  onSurfaceVar: '#49454f',
  onPrimaryContainer: '#00201c',
  primary: '#006a60',
  frameBorder: 'rgba(116,119,117,0.5)'
};

// ─────────────────────────────────────────────────────────────
// Status bar (time left, wifi/cell/battery right)
// ─────────────────────────────────────────────────────────────
function AndroidStatusBar({
  dark = false
}) {
  const c = dark ? '#fff' : MD_C.onSurface;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      position: 'relative',
      fontFamily: 'Roboto, system-ui, sans-serif'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 128,
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      fontWeight: 400,
      letterSpacing: 0.25,
      lineHeight: '20px',
      color: c
    }
  }, "9:30")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: '50%',
      top: 8,
      transform: 'translateX(-50%)',
      width: 24,
      height: 24,
      borderRadius: 100,
      background: '#2e2e2e'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      paddingRight: 2
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    style: {
      marginRight: -2
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8 13.3L.67 5.97a10.37 10.37 0 0114.66 0L8 13.3z",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16",
    style: {
      marginRight: -2
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M14.67 14.67V1.33L1.33 14.67h13.34z",
    fill: c
  }))), /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 16 16"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3.75",
    y: "2",
    width: "8.5",
    height: "13",
    rx: "1.5",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "5.5",
    y: "0.9",
    width: "5",
    height: "2",
    rx: "0.5",
    fill: c
  }))));
}

// ─────────────────────────────────────────────────────────────
// Top app bar (Material 3 small/medium)
// ─────────────────────────────────────────────────────────────
function AndroidAppBar({
  title = 'Title',
  large = false
}) {
  const iconDot = /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 22,
      height: 22,
      borderRadius: '50%',
      background: MD_C.onSurfaceVar,
      opacity: 0.3
    }
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: MD_C.surface,
      padding: '4px 4px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }
  }, iconDot, !large && /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 22,
      fontWeight: 400,
      color: MD_C.onSurface,
      fontFamily: 'Roboto, system-ui, sans-serif'
    }
  }, title), large && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), iconDot), large && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 16px 20px',
      fontSize: 28,
      fontWeight: 400,
      color: MD_C.onSurface,
      fontFamily: 'Roboto, system-ui, sans-serif'
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// List item (Material 3)
// ─────────────────────────────────────────────────────────────
function AndroidListItem({
  headline,
  supporting,
  leading
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '12px 16px',
      minHeight: 56,
      boxSizing: 'border-box',
      fontFamily: 'Roboto, system-ui, sans-serif'
    }
  }, leading && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: MD_C.primary,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
      fontWeight: 500,
      flexShrink: 0
    }
  }, leading), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: MD_C.onSurface,
      lineHeight: '24px'
    }
  }, headline), supporting && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14,
      color: MD_C.onSurfaceVar,
      lineHeight: '20px'
    }
  }, supporting)));
}

// ─────────────────────────────────────────────────────────────
// Gesture nav bar (pill)
// ─────────────────────────────────────────────────────────────
function AndroidNavBar({
  dark = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 108,
      height: 4,
      borderRadius: 2,
      background: dark ? '#fff' : MD_C.onSurface,
      opacity: 0.4
    }
  }));
}

// ─────────────────────────────────────────────────────────────
// Device frame — wraps everything
// ─────────────────────────────────────────────────────────────
function AndroidDevice({
  children,
  width = 412,
  height = 892,
  dark = false,
  title,
  large = false,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 18,
      overflow: 'hidden',
      background: dark ? '#1d1b20' : MD_C.surface,
      border: `8px solid ${MD_C.frameBorder}`,
      boxShadow: '0 30px 80px rgba(0,0,0,0.25)',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement(AndroidStatusBar, {
    dark: dark
  }), title !== undefined && /*#__PURE__*/React.createElement(AndroidAppBar, {
    title: title,
    large: large
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(AndroidKeyboard, null), /*#__PURE__*/React.createElement(AndroidNavBar, {
    dark: dark
  }));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — Gboard (Material 3)
// ─────────────────────────────────────────────────────────────
function AndroidKeyboard() {
  let _k = 0;
  const key = (l, {
    flex = 1,
    bg = MD_C.surface,
    r = 6,
    minW,
    fs = 21
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: _k++,
    style: {
      height: 46,
      borderRadius: r,
      flex,
      minWidth: minW,
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Roboto, system-ui',
      fontSize: fs,
      color: MD_C.onPrimaryContainer
    }
  }, l);
  const row = (keys, style = {}) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      justifyContent: 'center',
      ...style
    }
  }, keys.map(l => key(l)));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: MD_C.inverseOnSurface,
      padding: '0 8px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], {
    padding: '0 20px'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, key('', {
    bg: MD_C.surfaceVariant
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      flex: 7,
      minWidth: 274
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l))), key('', {
    bg: MD_C.surfaceVariant
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, key('?123', {
    bg: MD_C.secondaryContainer,
    r: 100,
    minW: 58,
    fs: 14
  }), key(',', {
    bg: MD_C.surfaceVariant
  }), key('', {
    flex: 3,
    minW: 154
  }), key('.', {
    bg: MD_C.surfaceVariant
  }), key('', {
    bg: MD_C.primaryFixedDim,
    r: 100,
    minW: 58
  }))));
}
Object.assign(window, {
  AndroidDevice,
  AndroidStatusBar,
  AndroidAppBar,
  AndroidListItem,
  AndroidNavBar,
  AndroidKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "android-frame.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF Badge — compact status/label token.
 * tones: brand | alert | warning | info | neutral | ghost
 */
function Badge({
  children,
  tone = 'neutral',
  icon = null,
  size = 'md',
  style = {},
  ...rest
}) {
  const tones = {
    brand: {
      bg: 'var(--green-050)',
      fg: 'var(--green-700)',
      bd: 'transparent'
    },
    alert: {
      bg: 'var(--alert-100)',
      fg: 'var(--alert-600)',
      bd: 'transparent'
    },
    warning: {
      bg: 'var(--amber-100)',
      fg: 'var(--amber-600)',
      bd: 'transparent'
    },
    info: {
      bg: 'var(--azure-100)',
      fg: 'var(--azure-600)',
      bd: 'transparent'
    },
    neutral: {
      bg: 'var(--ink-100)',
      fg: 'var(--ink-700)',
      bd: 'transparent'
    },
    ghost: {
      bg: 'rgba(255,255,255,0.10)',
      fg: 'var(--text-primary)',
      bd: 'var(--border-glass)'
    }
  };
  const t = tones[tone] || tones.neutral;
  const isSm = size === 'sm';
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      height: isSm ? 20 : 24,
      padding: isSm ? '0 8px' : '0 10px',
      background: t.bg,
      color: t.fg,
      border: `1px solid ${t.bd}`,
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-ui)',
      fontSize: isSm ? 'var(--fs-label)' : 'var(--fs-caption)',
      fontWeight: 'var(--fw-semibold)',
      letterSpacing: '0.01em',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: '1.05em'
    }
  }, icon), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button/Button.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF Button — primary action control.
 * Calm, confident, touch-first. Compresses slightly on press; never bounces.
 */
function Button({
  children,
  variant = 'primary',
  // primary | secondary | ghost | danger
  size = 'md',
  // sm | md | lg
  leadingIcon = null,
  trailingIcon = null,
  fullWidth = false,
  disabled = false,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: {
      h: 38,
      px: 14,
      fs: 'var(--fs-body-sm)',
      gap: 8,
      r: 'var(--radius-pill)'
    },
    md: {
      h: 'var(--hit-comfy)',
      px: 18,
      fs: 'var(--fs-body)',
      gap: 8,
      r: 'var(--radius-pill)'
    },
    lg: {
      h: 'var(--hit-large)',
      px: 24,
      fs: 'var(--fs-body-lg)',
      gap: 9,
      r: 'var(--radius-pill)'
    }
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    primary: {
      background: 'var(--brand)',
      color: 'var(--brand-contrast)',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-float)'
    },
    secondary: {
      background: 'var(--surface-glass-2)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-glass)',
      boxShadow: 'var(--shadow-float)',
      backdropFilter: 'blur(var(--blur-glass))',
      WebkitBackdropFilter: 'blur(var(--blur-glass))'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-primary)',
      border: '1px solid transparent'
    },
    danger: {
      background: 'var(--alert-500)',
      color: '#fff',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-float)'
    }
  };
  const v = variants[variant] || variants.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.gap,
      height: s.h,
      padding: `0 ${s.px}px`,
      width: fullWidth ? '100%' : 'auto',
      fontFamily: 'var(--font-ui)',
      fontSize: s.fs,
      fontWeight: 'var(--fw-semibold)',
      letterSpacing: '0.005em',
      lineHeight: 1,
      borderRadius: s.r,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      whiteSpace: 'nowrap',
      transition: 'transform var(--dur-fast) var(--ease-standard), filter var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard)',
      WebkitTapHighlightColor: 'transparent',
      ...v,
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = 'scale(var(--press-scale))';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), leadingIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: '1.15em'
    }
  }, leadingIcon), children, trailingIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: '1.15em'
    }
  }, trailingIcon));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/ButtonGroup.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF ButtonGroup — joins a set of <Button>s into one segmented control.
 * Outer corners stay rounded; inner corners square; segments share a
 * hairline divider and a single elevation. Works horizontally or
 * vertically and keeps each child Button's own variant/disabled state.
 */
function ButtonGroup({
  children,
  orientation = 'horizontal',
  // 'horizontal' | 'vertical'
  size,
  // optional: force a size onto every segment
  fullWidth = false,
  // stretch to fill, segments share space equally
  attached = true,
  // true: joined segments · false: evenly spaced pills
  style = {},
  ...rest
}) {
  const vertical = orientation === 'vertical';
  const items = React.Children.toArray(children).filter(Boolean);
  const last = items.length - 1;
  const r = 'var(--radius-md)';
  const divider = '1px solid var(--border-glass)';
  if (!attached) {
    return /*#__PURE__*/React.createElement("div", _extends({
      role: "group",
      style: {
        display: fullWidth ? 'flex' : 'inline-flex',
        flexDirection: vertical ? 'column' : 'row',
        gap: 8,
        ...style
      }
    }, rest), items.map((child, i) => React.cloneElement(child, {
      key: i,
      size: size || child.props.size,
      style: {
        flex: !vertical && fullWidth ? '1 1 0' : '0 0 auto',
        ...child.props.style
      }
    })));
  }
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "group",
    style: {
      display: fullWidth ? 'flex' : 'inline-flex',
      flexDirection: vertical ? 'column' : 'row',
      borderRadius: r,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-float)',
      width: fullWidth ? '100%' : 'auto',
      ...style
    }
  }, rest), items.map((child, i) => {
    const first = i === 0;
    const end = i === last;
    const corners = vertical ? {
      borderTopLeftRadius: first ? r : 0,
      borderTopRightRadius: first ? r : 0,
      borderBottomLeftRadius: end ? r : 0,
      borderBottomRightRadius: end ? r : 0
    } : {
      borderTopLeftRadius: first ? r : 0,
      borderBottomLeftRadius: first ? r : 0,
      borderTopRightRadius: end ? r : 0,
      borderBottomRightRadius: end ? r : 0
    };
    const seam = first ? {} : vertical ? {
      borderTop: divider
    } : {
      borderLeft: divider
    };
    // Horizontal full-width: segments share width equally (flex-basis 0).
    // Vertical: keep each Button's natural height; width comes from
    // align-items: stretch (the column default), so flex must stay auto —
    // a flex-basis of 0 here would collapse rows to text height.
    const flex = !vertical && fullWidth ? '1 1 0' : '0 0 auto';
    return React.cloneElement(child, {
      key: i,
      size: size || child.props.size,
      style: {
        ...corners,
        ...seam,
        boxShadow: 'none',
        flex,
        ...(vertical ? {
          justifyContent: 'flex-start'
        } : null),
        ...child.props.style
      }
    });
  }));
}
Object.assign(__ds_scope, { ButtonGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/ButtonGroup.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF Card — content container. Two surfaces:
 *  tone="light" (white, marketing/docs) and tone="glass" (frosted, over map).
 */
function Card({
  children,
  tone = 'light',
  // light | glass
  padding = 'var(--space-6)',
  interactive = false,
  style = {},
  ...rest
}) {
  const isGlass = tone === 'glass';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: isGlass ? 'var(--surface-glass)' : 'var(--surface-card)',
      color: isGlass ? 'var(--text-primary)' : 'var(--text-ink)',
      border: `1px solid ${isGlass ? 'var(--border-glass)' : 'var(--border-light)'}`,
      borderRadius: 'var(--radius-lg)',
      boxShadow: isGlass ? 'var(--shadow-float)' : 'var(--shadow-card)',
      backdropFilter: isGlass ? 'blur(var(--blur-glass))' : 'none',
      WebkitBackdropFilter: isGlass ? 'blur(var(--blur-glass))' : 'none',
      padding,
      transition: interactive ? 'transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard)' : 'none',
      cursor: interactive ? 'pointer' : 'default',
      ...style
    },
    onMouseEnter: interactive ? e => {
      e.currentTarget.style.transform = 'translateY(-2px)';
    } : undefined,
    onMouseLeave: interactive ? e => {
      e.currentTarget.style.transform = 'translateY(0)';
    } : undefined
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF Chip — selectable filter / quick action. Used for map filters
 * ("Cameras", "Gas", "Avoid tolls") and saved-place shortcuts.
 * Defaults to a glass tone for floating over the map.
 */
function Chip({
  children,
  selected = false,
  icon = null,
  tone = 'glass',
  // glass | light
  onClick,
  style = {},
  ...rest
}) {
  const isLight = tone === 'light';
  const base = isLight ? {
    bg: 'var(--surface-card)',
    fg: 'var(--text-ink)',
    bd: 'var(--border-light)'
  } : {
    bg: 'var(--surface-glass)',
    fg: 'var(--text-primary)',
    bd: 'var(--border-glass)'
  };
  const sel = selected ? {
    bg: 'var(--brand)',
    fg: 'var(--brand-contrast)',
    bd: 'transparent'
  } : base;
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    "aria-pressed": selected,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      height: 34,
      padding: '0 12px',
      background: sel.bg,
      color: sel.fg,
      border: `1px solid ${sel.bd}`,
      borderRadius: 'var(--radius-pill)',
      boxShadow: isLight ? 'none' : 'var(--shadow-float)',
      backdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
      WebkitBackdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body-sm)',
      fontWeight: 'var(--fw-semibold)',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      flex: '0 0 auto',
      transition: 'transform var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    },
    onMouseDown: e => {
      e.currentTarget.style.transform = 'scale(var(--press-scale))';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      fontSize: '1.05em'
    }
  }, icon), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon/Icon.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/* Curated Lucide icon set (Lucide geometry: 24×24 viewBox, 2px stroke,
   round caps & joins). Each entry is an array of [tag, attrs] nodes. */
const ICONS = {
  // search / nav chrome
  search: [['circle', {
    cx: 11,
    cy: 11,
    r: 8
  }], ['path', {
    d: 'm21 21-4.3-4.3'
  }]],
  navigation: [['polygon', {
    points: '3 11 22 2 13 21 11 13 3 11'
  }]],
  'navigation-2': [['polygon', {
    points: '12 2 19 21 12 17 5 21 12 2'
  }]],
  layers: [['path', {
    d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z'
  }], ['path', {
    d: 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65'
  }], ['path', {
    d: 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65'
  }]],
  plus: [['path', {
    d: 'M5 12h14'
  }], ['path', {
    d: 'M12 5v14'
  }]],
  minus: [['path', {
    d: 'M5 12h14'
  }]],
  'share-2': [['circle', {
    cx: 18,
    cy: 5,
    r: 3
  }], ['circle', {
    cx: 6,
    cy: 12,
    r: 3
  }], ['circle', {
    cx: 18,
    cy: 19,
    r: 3
  }], ['path', {
    d: 'm8.59 13.51 6.83 3.98'
  }], ['path', {
    d: 'm15.41 6.51-6.82 3.98'
  }]],
  x: [['path', {
    d: 'M18 6 6 18'
  }], ['path', {
    d: 'M6 6l12 12'
  }]],
  'rotate-cw': [['path', {
    d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'
  }], ['path', {
    d: 'M21 3v5h-5'
  }]],
  'volume-2': [['polygon', {
    points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5'
  }], ['path', {
    d: 'M15.54 8.46a5 5 0 0 1 0 7.07'
  }], ['path', {
    d: 'M19.07 4.93a10 10 0 0 1 0 14.14'
  }]],
  mic: [['path', {
    d: 'M12 19v3'
  }], ['path', {
    d: 'M19 10v2a7 7 0 0 1-14 0v-2'
  }], ['rect', {
    x: 9,
    y: 2,
    width: 6,
    height: 13,
    rx: 3
  }]],
  'chevron-right': [['path', {
    d: 'm9 18 6-6-6-6'
  }]],
  'chevron-down': [['path', {
    d: 'm6 9 6 6 6-6'
  }]],
  sun: [['circle', {
    cx: 12,
    cy: 12,
    r: 4
  }], ['path', {
    d: 'M12 2v2'
  }], ['path', {
    d: 'M12 20v2'
  }], ['path', {
    d: 'm4.93 4.93 1.41 1.41'
  }], ['path', {
    d: 'm17.66 17.66 1.41 1.41'
  }], ['path', {
    d: 'M2 12h2'
  }], ['path', {
    d: 'M20 12h2'
  }], ['path', {
    d: 'm6.34 17.66-1.41 1.41'
  }], ['path', {
    d: 'm19.07 4.93-1.41 1.41'
  }]],
  moon: [['path', {
    d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'
  }]],
  user: [['path', {
    d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'
  }], ['circle', {
    cx: 12,
    cy: 7,
    r: 4
  }]],
  menu: [['path', {
    d: 'M4 12h16'
  }], ['path', {
    d: 'M4 6h16'
  }], ['path', {
    d: 'M4 18h16'
  }]],
  sliders: [['line', {
    x1: 4,
    x2: 4,
    y1: 21,
    y2: 14
  }], ['line', {
    x1: 4,
    x2: 4,
    y1: 10,
    y2: 3
  }], ['line', {
    x1: 12,
    x2: 12,
    y1: 21,
    y2: 12
  }], ['line', {
    x1: 12,
    x2: 12,
    y1: 8,
    y2: 3
  }], ['line', {
    x1: 20,
    x2: 20,
    y1: 21,
    y2: 16
  }], ['line', {
    x1: 20,
    x2: 20,
    y1: 12,
    y2: 3
  }], ['line', {
    x1: 2,
    x2: 6,
    y1: 14,
    y2: 14
  }], ['line', {
    x1: 10,
    x2: 14,
    y1: 8,
    y2: 8
  }], ['line', {
    x1: 18,
    x2: 22,
    y1: 16,
    y2: 16
  }]],
  info: [['circle', {
    cx: 12,
    cy: 12,
    r: 10
  }], ['path', {
    d: 'M12 16v-4'
  }], ['path', {
    d: 'M12 8h.01'
  }]],
  'circle-check': [['circle', {
    cx: 12,
    cy: 12,
    r: 10
  }], ['path', {
    d: 'm9 12 2 2 4-4'
  }]],
  clock: [['circle', {
    cx: 12,
    cy: 12,
    r: 10
  }], ['polyline', {
    points: '12 6 12 12 16 14'
  }]],
  // routes / surveillance
  zap: [['path', {
    d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'
  }]],
  shield: [['path', {
    d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'
  }]],
  'shield-check': [['path', {
    d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'
  }], ['path', {
    d: 'm9 12 2 2 4-4'
  }]],
  check: [['path', {
    d: 'M20 6 9 17l-5-5'
  }]],
  camera: [['path', {
    d: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z'
  }], ['circle', {
    cx: 12,
    cy: 13,
    r: 3
  }]],
  'scan-eye': [['path', {
    d: 'M3 7V5a2 2 0 0 1 2-2h2'
  }], ['path', {
    d: 'M17 3h2a2 2 0 0 1 2 2v2'
  }], ['path', {
    d: 'M21 17v2a2 2 0 0 1-2 2h-2'
  }], ['path', {
    d: 'M7 21H5a2 2 0 0 1-2-2v-2'
  }], ['circle', {
    cx: 12,
    cy: 12,
    r: 1
  }], ['path', {
    d: 'M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0'
  }]],
  'triangle-alert': [['path', {
    d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z'
  }], ['path', {
    d: 'M12 9v4'
  }], ['path', {
    d: 'M12 17h.01'
  }]],
  // places
  'map-pin': [['path', {
    d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0'
  }], ['circle', {
    cx: 12,
    cy: 10,
    r: 3
  }]],
  flag: [['path', {
    d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'
  }], ['path', {
    d: 'M4 22V4'
  }]],
  star: [['polygon', {
    points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'
  }]],
  coffee: [['path', {
    d: 'M10 2v2'
  }], ['path', {
    d: 'M14 2v2'
  }], ['path', {
    d: 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1'
  }], ['path', {
    d: 'M6 2v2'
  }]],
  fuel: [['line', {
    x1: 3,
    x2: 15,
    y1: 22,
    y2: 22
  }], ['line', {
    x1: 4,
    x2: 14,
    y1: 9,
    y2: 9
  }], ['path', {
    d: 'M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18'
  }], ['path', {
    d: 'M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5'
  }]],
  home: [['path', {
    d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'
  }], ['path', {
    d: 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
  }]],
  briefcase: [['path', {
    d: 'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'
  }], ['rect', {
    width: 20,
    height: 14,
    x: 2,
    y: 6,
    rx: 2
  }]],
  // maneuvers
  'corner-up-right': [['polyline', {
    points: '15 14 20 9 15 4'
  }], ['path', {
    d: 'M4 20v-7a4 4 0 0 1 4-4h12'
  }]],
  'corner-up-left': [['polyline', {
    points: '9 14 4 9 9 4'
  }], ['path', {
    d: 'M20 20v-7a4 4 0 0 0-4-4H4'
  }]],
  'arrow-up': [['path', {
    d: 'm5 12 7-7 7 7'
  }], ['path', {
    d: 'M12 19V5'
  }]],
  'git-merge': [['circle', {
    cx: 18,
    cy: 18,
    r: 3
  }], ['circle', {
    cx: 6,
    cy: 6,
    r: 3
  }], ['path', {
    d: 'M6 21V9a9 9 0 0 0 9 9'
  }]],
  'undo-2': [['path', {
    d: 'M9 14 4 9l5-5'
  }], ['path', {
    d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11'
  }]],
  // editing / contribution
  pencil: [['path', {
    d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'
  }], ['path', {
    d: 'm15 5 4 4'
  }]],
  'trash-2': [['path', {
    d: 'M3 6h18'
  }], ['path', {
    d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'
  }], ['path', {
    d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'
  }], ['line', {
    x1: 10,
    x2: 10,
    y1: 11,
    y2: 17
  }], ['line', {
    x1: 14,
    x2: 14,
    y1: 11,
    y2: 17
  }]],
  upload: [['path', {
    d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'
  }], ['polyline', {
    points: '17 8 12 3 7 8'
  }], ['line', {
    x1: 12,
    x2: 12,
    y1: 3,
    y2: 15
  }]],
  crosshair: [['circle', {
    cx: 12,
    cy: 12,
    r: 10
  }], ['line', {
    x1: 22,
    x2: 18,
    y1: 12,
    y2: 12
  }], ['line', {
    x1: 6,
    x2: 2,
    y1: 12,
    y2: 12
  }], ['line', {
    x1: 12,
    x2: 12,
    y1: 6,
    y2: 2
  }], ['line', {
    x1: 12,
    x2: 12,
    y1: 22,
    y2: 18
  }]],
  'chevron-left': [['path', {
    d: 'm15 18-6-6 6-6'
  }]]
};

/**
 * DAF Icon — the single Lucide-based icon primitive used across the system.
 * Renders a stroked 24-grid SVG that inherits `currentColor`.
 */
function Icon({
  name,
  size = 20,
  stroke = 2,
  color = 'currentColor',
  strokeColor,
  style = {},
  title,
  ...rest
}) {
  const nodes = ICONS[name];
  const sc = strokeColor || color;
  return /*#__PURE__*/React.createElement("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: sc,
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": title ? undefined : true,
    role: title ? 'img' : undefined,
    style: {
      display: 'block',
      flex: '0 0 auto',
      ...style
    }
  }, rest), title && /*#__PURE__*/React.createElement("title", null, title), (nodes || []).map(([tag, attrs], i) => React.createElement(tag, {
    key: i,
    ...attrs
  })));
}

/** Names available in this build — handy for icon-grid specimens. */
const ICON_NAMES = Object.keys(ICONS);
Object.assign(__ds_scope, { Icon, ICON_NAMES });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Checkbox.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF Checkbox — multi-select / opt-in toggle (e.g. "Avoid tolls",
 * "Avoid highways"). Brand fill with a Lucide check when on; supports an
 * indeterminate (mixed) state. Pairs an optional label + description.
 */
function Checkbox({
  checked = false,
  indeterminate = false,
  onChange,
  disabled = false,
  label,
  description,
  size = 'md',
  // sm | md
  style = {},
  ...rest
}) {
  const dim = size === 'sm' ? 18 : 22;
  const on = checked || indeterminate;
  const toggle = () => !disabled && onChange && onChange(!checked);
  const box = /*#__PURE__*/React.createElement("span", {
    role: "checkbox",
    "aria-checked": indeterminate ? 'mixed' : checked,
    "aria-label": !label ? 'checkbox' : undefined,
    "aria-disabled": disabled || undefined,
    tabIndex: disabled ? -1 : 0,
    onClick: toggle,
    onKeyDown: e => {
      if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        toggle();
      }
    },
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: dim,
      height: dim,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-xs)',
      background: on ? 'var(--brand)' : 'var(--surface-card)',
      border: `1.5px solid ${on ? 'transparent' : 'var(--border-strong)'}`,
      color: 'var(--brand-contrast)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
      WebkitTapHighlightColor: 'transparent'
    }
  }, indeterminate ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "minus",
    size: Math.round(dim * 0.66),
    stroke: 3
  }) : checked ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: Math.round(dim * 0.66),
    stroke: 3
  }) : null);
  if (!label) return React.cloneElement(box, {
    style: {
      ...box.props.style,
      ...style
    }
  });
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'inline-flex',
      alignItems: description ? 'flex-start' : 'center',
      gap: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      ...style
    }
  }, rest), description ? React.cloneElement(box, {
    style: {
      ...box.props.style,
      marginTop: 1
    }
  }) : box, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--text-primary)',
      lineHeight: 1.3
    }
  }, label), description && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-secondary)',
      lineHeight: 1.4
    }
  }, description)));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/core/Combobox.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF Combobox — autocomplete field that powers destination search in the
 * SearchBar. A glass search field with a floating results panel: substring
 * filtering with match highlighting, leading icons + sublabels + trailing
 * meta (distance), keyboard nav (↑/↓/Enter/Esc), and an empty state.
 */
function Combobox({
  options = [],
  // [{ value, label, sublabel?, icon?, meta? }]
  onSelect,
  // (option) => void
  onChange,
  // (query) => void — for async/remote results
  placeholder = 'Search destinations',
  emptyText = 'No matches',
  filter = true,
  // built-in substring filter; false = pre-filtered
  tone = 'glass',
  // glass | light
  size = 'md',
  // md | lg
  maxVisible = 6,
  style = {},
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [hi, setHi] = React.useState(0);
  const rootRef = React.useRef(null);
  const listRef = React.useRef(null);
  const isLight = tone === 'light';
  const q = query.trim().toLowerCase();
  const filtered = filter && q ? options.filter(o => `${o.label} ${o.sublabel || ''}`.toLowerCase().includes(q)) : options;
  React.useEffect(() => {
    setHi(0);
  }, [query, open]);
  React.useEffect(() => {
    const onDoc = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, []);
  const choose = o => {
    if (!o) return;
    setQuery(o.label);
    setOpen(false);
    onSelect && onSelect(o);
  };
  const onKeyDown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi(h => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      if (open && filtered[hi]) {
        e.preventDefault();
        choose(filtered[hi]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };
  const h = size === 'lg' ? 'var(--hit-large)' : 'var(--hit-comfy)';
  const fieldBg = isLight ? 'var(--surface-card)' : 'var(--surface-glass-2)';
  const panelBg = isLight ? 'var(--surface-card)' : 'var(--surface-glass-2)';
  const renderMatch = text => {
    if (!q) return text;
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return text;
    return /*#__PURE__*/React.createElement(React.Fragment, null, text.slice(0, i), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 'var(--fw-bold)',
        color: 'var(--text-primary)'
      }
    }, text.slice(i, i + q.length)), text.slice(i + q.length));
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    ref: rootRef,
    style: {
      position: 'relative',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: h,
      padding: '0 14px',
      borderRadius: 'var(--radius-sm)',
      background: fieldBg,
      border: '1px solid var(--border-glass)',
      boxShadow: 'var(--shadow-float)',
      backdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
      WebkitBackdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      color: 'var(--text-tertiary)',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 18
  })), /*#__PURE__*/React.createElement("input", {
    value: query,
    onChange: e => {
      setQuery(e.target.value);
      setOpen(true);
      onChange && onChange(e.target.value);
    },
    onFocus: () => setOpen(true),
    onKeyDown: onKeyDown,
    placeholder: placeholder,
    role: "combobox",
    "aria-expanded": open,
    "aria-autocomplete": "list",
    style: {
      flex: 1,
      minWidth: 0,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--text-primary)'
    }
  }), query && /*#__PURE__*/React.createElement("button", {
    "aria-label": "Clear",
    onClick: () => {
      setQuery('');
      setOpen(true);
      onChange && onChange('');
    },
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 26,
      height: 26,
      flex: '0 0 auto',
      border: 'none',
      background: 'transparent',
      color: 'var(--text-tertiary)',
      cursor: 'pointer',
      borderRadius: '50%',
      WebkitTapHighlightColor: 'transparent'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 16
  }))), open && /*#__PURE__*/React.createElement("div", {
    ref: listRef,
    role: "listbox",
    style: {
      position: 'absolute',
      top: 'calc(100% + 6px)',
      left: 0,
      right: 0,
      zIndex: 40,
      background: panelBg,
      border: '1px solid var(--border-glass)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-float)',
      backdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
      WebkitBackdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
      padding: 6,
      maxHeight: maxVisible * 52 + 12,
      overflowY: 'auto'
    }
  }, filtered.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 12px',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-tertiary)',
      textAlign: 'center'
    }
  }, emptyText) : filtered.map((o, i) => {
    const active = i === hi;
    return /*#__PURE__*/React.createElement("button", {
      key: o.value ?? i,
      role: "option",
      "aria-selected": active,
      onMouseEnter: () => setHi(i),
      onClick: () => choose(o),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        width: '100%',
        padding: '8px 10px',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        background: active ? 'var(--surface-card-alt)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background var(--dur-instant) var(--ease-standard)',
        WebkitTapHighlightColor: 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        flex: '0 0 auto',
        borderRadius: 'var(--radius-sm)',
        background: isLight ? 'var(--surface-card-alt)' : 'var(--surface-glass)',
        color: 'var(--text-secondary)'
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: o.icon || 'map-pin',
      size: 18
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--fs-body)',
        fontWeight: 'var(--fw-medium)',
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, renderMatch(o.label)), o.sublabel && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'block',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--fs-body-sm)',
        color: 'var(--text-tertiary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, o.sublabel)), o.meta && /*#__PURE__*/React.createElement("span", {
      style: {
        flex: '0 0 auto',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-body-sm)',
        color: 'var(--text-tertiary)',
        fontFeatureSettings: 'var(--num-feature)'
      }
    }, o.meta));
  })));
}
Object.assign(__ds_scope, { Combobox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Combobox.jsx", error: String((e && e.message) || e) }); }

// components/core/Dialog.jsx
try { (() => {
const ICON_TONES = {
  brand: {
    bg: 'var(--brand-soft)',
    fg: 'var(--text-brand)'
  },
  alert: {
    bg: 'var(--alert-100)',
    fg: 'var(--alert-600)'
  },
  warning: {
    bg: 'var(--amber-100)',
    fg: 'var(--amber-600)'
  },
  info: {
    bg: 'var(--azure-100)',
    fg: 'var(--azure-600)'
  }
};

/**
 * DAF Dialog — modal surface for focused tasks (route options, place
 * details, settings). Dimmed, blurred scrim over the map; a raised panel
 * with the modal-shell radius. Optional tinted icon, title, description,
 * body and a right-aligned footer for actions.
 */
function Dialog({
  open = true,
  onClose,
  title,
  description,
  children,
  footer,
  icon,
  // icon name; renders a tinted chip
  tone = 'brand',
  // chip tone: brand | alert | warning | info
  size = 'md',
  // sm | md | lg
  dismissable = true,
  // click scrim / show close button
  style = {}
}) {
  if (!open) return null;
  const widths = {
    sm: 380,
    md: 460,
    lg: 560
  };
  const it = ICON_TONES[tone] || ICON_TONES.brand;
  return /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": "true",
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 80,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: dismissable ? onClose : undefined,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(11,14,18,0.55)',
      backdropFilter: 'blur(var(--blur-soft))',
      WebkitBackdropFilter: 'blur(var(--blur-soft))'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: widths[size] || widths.md,
      maxWidth: '100%',
      background: 'var(--surface-raised)',
      border: '1px solid var(--border-glass)',
      borderRadius: 'var(--radius-2xl)',
      boxShadow: 'var(--shadow-sheet)',
      padding: 'var(--space-6)',
      color: 'var(--text-primary)',
      ...style
    }
  }, dismissable && onClose && /*#__PURE__*/React.createElement("button", {
    "aria-label": "Close",
    onClick: onClose,
    style: {
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
      WebkitTapHighlightColor: 'transparent'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 18
  })), icon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 44,
      height: 44,
      marginBottom: 14,
      borderRadius: 'var(--radius-md)',
      background: it.bg,
      color: it.fg
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 22
  })), title && /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--fs-h3)',
      lineHeight: 'var(--lh-h3)',
      fontWeight: 'var(--fw-bold)',
      letterSpacing: 'var(--ls-heading)',
      color: 'var(--text-primary)',
      paddingRight: dismissable && onClose ? 36 : 0
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '8px 0 0',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body)',
      lineHeight: 'var(--lh-body)',
      color: 'var(--text-secondary)',
      textWrap: 'pretty'
    }
  }, description), children && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 'var(--space-6)'
    }
  }, footer)));
}

/**
 * DAF AlertDialog — confirmation modal that demands an explicit choice. Not
 * scrim-dismissable; renders Cancel + Confirm. Set `destructive` for
 * irreversible actions (red confirm, alert icon).
 */
function AlertDialog({
  open = true,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  icon,
  style = {}
}) {
  return /*#__PURE__*/React.createElement(Dialog, {
    open: open,
    onClose: onCancel,
    dismissable: false,
    size: "sm",
    icon: icon || (destructive ? 'triangle-alert' : 'info'),
    tone: destructive ? 'alert' : 'info',
    title: title,
    description: description,
    style: style,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(__ds_scope.Button, {
      variant: "ghost",
      onClick: onCancel
    }, cancelLabel), /*#__PURE__*/React.createElement(__ds_scope.Button, {
      variant: destructive ? 'danger' : 'primary',
      onClick: onConfirm
    }, confirmLabel))
  });
}
Object.assign(__ds_scope, { Dialog, AlertDialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF IconButton — circular/square glass control for floating map actions
 * (recenter, layers, compass, mute). High-contrast over any map.
 */
function IconButton({
  children,
  label,
  // aria-label (required for a11y)
  variant = 'glass',
  // glass | solid | brand | plain
  size = 'md',
  // sm | md | lg
  active = false,
  disabled = false,
  style = {},
  ...rest
}) {
  const dims = {
    sm: 38,
    md: 'var(--hit-comfy)',
    lg: 'var(--hit-large)'
  };
  const d = dims[size] || dims.md;
  const variants = {
    glass: {
      background: 'var(--surface-glass)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-glass)',
      boxShadow: 'var(--shadow-float)',
      backdropFilter: 'blur(var(--blur-glass))',
      WebkitBackdropFilter: 'blur(var(--blur-glass))'
    },
    solid: {
      background: 'var(--surface-raised)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-glass)',
      boxShadow: 'var(--shadow-float)'
    },
    brand: {
      background: 'var(--brand)',
      color: 'var(--brand-contrast)',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-float)'
    },
    plain: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      border: '1px solid transparent'
    }
  };
  const v = variants[variant] || variants.glass;
  const activeStyle = active ? {
    color: 'var(--brand)',
    border: '1px solid var(--brand)'
  } : {};
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    "aria-pressed": active || undefined,
    disabled: disabled,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: d,
      height: d,
      fontSize: size === 'sm' ? 18 : 20,
      borderRadius: 'var(--radius-pill)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'transform var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
      WebkitTapHighlightColor: 'transparent',
      flex: '0 0 auto',
      ...v,
      ...activeStyle,
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = 'scale(var(--press-scale))';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF Input — text field for search & forms. Works on dark glass (default)
 * and light surfaces (tone="light").
 */
function Input({
  value,
  onChange,
  placeholder = '',
  leadingIcon = null,
  trailingIcon = null,
  tone = 'glass',
  // glass | light
  size = 'md',
  // md | lg
  disabled = false,
  style = {},
  ...rest
}) {
  const h = size === 'lg' ? 'var(--hit-large)' : 'var(--hit-comfy)';
  const isLight = tone === 'light';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: h,
      padding: '0 14px',
      borderRadius: 'var(--radius-sm)',
      background: isLight ? 'var(--surface-card)' : 'var(--surface-glass)',
      border: `1px solid ${isLight ? 'var(--border-light)' : 'var(--border-glass)'}`,
      boxShadow: isLight ? 'var(--shadow-card)' : 'var(--shadow-float)',
      backdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
      WebkitBackdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, leadingIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      color: isLight ? 'var(--text-ink-faint)' : 'var(--text-tertiary)',
      fontSize: 18
    }
  }, leadingIcon), /*#__PURE__*/React.createElement("input", _extends({
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    style: {
      flex: 1,
      minWidth: 0,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body)',
      fontWeight: 'var(--fw-medium)',
      color: isLight ? 'var(--text-ink)' : 'var(--text-primary)'
    }
  }, rest)), trailingIcon && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      color: isLight ? 'var(--text-ink-faint)' : 'var(--text-tertiary)',
      fontSize: 18
    }
  }, trailingIcon));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/RadioGroup.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF RadioGroup — single-select from a small set (e.g. route preference,
 * units, voice). Brand ring + dot on the selected option. Roving arrow-key
 * navigation; vertical by default.
 */
function RadioGroup({
  options = [],
  // [{ value, label, description?, disabled? }]
  value,
  onChange,
  orientation = 'vertical',
  // vertical | horizontal
  disabled = false,
  style = {},
  ...rest
}) {
  const selectedIdx = options.findIndex(o => o.value === value);
  const firstEnabled = options.findIndex(o => !o.disabled);
  const move = (from, dir) => {
    if (!options.length) return;
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) {
        onChange && onChange(options[i].value);
        break;
      }
    }
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "radiogroup",
    style: {
      display: 'flex',
      flexDirection: orientation === 'vertical' ? 'column' : 'row',
      gap: orientation === 'vertical' ? 14 : 22,
      flexWrap: 'wrap',
      ...style
    }
  }, rest), options.map((o, idx) => {
    const checked = o.value === value;
    const od = disabled || o.disabled;
    const tabbable = checked || selectedIdx === -1 && idx === firstEnabled;
    return /*#__PURE__*/React.createElement("label", {
      key: o.value,
      style: {
        display: 'inline-flex',
        alignItems: o.description ? 'flex-start' : 'center',
        gap: 10,
        cursor: od ? 'not-allowed' : 'pointer',
        opacity: od ? 0.5 : 1
      }
    }, /*#__PURE__*/React.createElement("span", {
      role: "radio",
      "aria-checked": checked,
      "aria-disabled": od || undefined,
      tabIndex: od ? -1 : tabbable ? 0 : -1,
      onClick: () => !od && onChange && onChange(o.value),
      onKeyDown: e => {
        if (od) return;
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange && onChange(o.value);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          move(idx, 1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          move(idx, -1);
        }
      },
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        flex: '0 0 auto',
        marginTop: o.description ? 1 : 0,
        borderRadius: '50%',
        background: 'var(--surface-card)',
        border: `1.5px solid ${checked ? 'var(--brand)' : 'var(--border-strong)'}`,
        outline: 'none',
        transition: 'border-color var(--dur-fast) var(--ease-standard)',
        WebkitTapHighlightColor: 'transparent'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: 'var(--brand)',
        transform: checked ? 'scale(1)' : 'scale(0)',
        transition: 'transform var(--dur-fast) var(--ease-soft)'
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--fs-body)',
        fontWeight: 'var(--fw-medium)',
        color: 'var(--text-primary)',
        lineHeight: 1.3
      }
    }, o.label), o.description && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--fs-body-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.4
      }
    }, o.description)));
  }));
}
Object.assign(__ds_scope, { RadioGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/RadioGroup.jsx", error: String((e && e.message) || e) }); }

// components/core/SegmentedControl.jsx
try { (() => {
/**
 * DAF SegmentedControl — switch between mutually-exclusive views.
 * Used for the route mode toggle (Fastest / Private) and map layers.
 * The active thumb slides; selected text is high-contrast.
 */
function SegmentedControl({
  options = [],
  // [{ value, label, icon? }]
  value,
  onChange,
  tone = 'glass',
  // glass | light
  style = {}
}) {
  const isLight = tone === 'light';
  const idx = Math.max(0, options.findIndex(o => o.value === value));
  const count = options.length || 1;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'grid',
      gridTemplateColumns: `repeat(${count}, 1fr)`,
      padding: 4,
      borderRadius: 'var(--radius-pill)',
      background: isLight ? 'var(--surface-card-alt)' : 'var(--surface-glass)',
      border: `1px solid ${isLight ? 'var(--border-light)' : 'var(--border-glass)'}`,
      backdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
      WebkitBackdropFilter: isLight ? 'none' : 'blur(var(--blur-glass))',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: `calc(4px + ${idx} * ((100% - 8px) / ${count}))`,
      width: `calc((100% - 8px) / ${count})`,
      borderRadius: 'var(--radius-pill)',
      background: isLight ? 'var(--surface-card)' : 'var(--surface-glass-2)',
      boxShadow: 'var(--shadow-card)',
      transition: 'left var(--dur-base) var(--ease-soft)'
    }
  }), options.map(o => {
    const active = o.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: o.value,
      onClick: () => onChange && onChange(o.value),
      style: {
        position: 'relative',
        zIndex: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        height: 40,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
        fontSize: 'var(--fs-body-sm)',
        fontWeight: 'var(--fw-semibold)',
        color: active ? isLight ? 'var(--text-ink)' : 'var(--text-primary)' : isLight ? 'var(--text-ink-faint)' : 'var(--text-secondary)',
        transition: 'color var(--dur-fast) var(--ease-standard)',
        WebkitTapHighlightColor: 'transparent'
      }
    }, o.icon && /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        fontSize: '1.1em'
      }
    }, o.icon), o.label);
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/core/Slider.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF Slider — continuous value selector (e.g. "Avoid detours over…",
 * voice volume, search radius). White knob on a brand-filled track,
 * matching the Switch idiom. Click the track, drag the knob, or use
 * arrow / Home / End keys.
 */
function Slider({
  value,
  defaultValue = 0,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  disabled = false,
  label,
  showValue = false,
  formatValue,
  // (v) => string for the readout
  style = {},
  ...rest
}) {
  const isControlled = value != null;
  const [internal, setInternal] = React.useState(defaultValue);
  const [focused, setFocused] = React.useState(false);
  const v = isControlled ? value : internal;
  const trackRef = React.useRef(null);
  const span = max - min || 1;
  const pct = Math.min(100, Math.max(0, (v - min) / span * 100));
  const clamp = n => Math.min(max, Math.max(min, n));
  const snap = n => clamp(parseFloat((Math.round((n - min) / step) * step + min).toFixed(6)));
  const commit = n => {
    const nv = snap(n);
    if (nv === v) return;
    if (!isControlled) setInternal(nv);
    onChange && onChange(nv);
  };
  const fromX = clientX => {
    const r = trackRef.current.getBoundingClientRect();
    return min + (clientX - r.left) / (r.width || 1) * span;
  };
  const onPointerDown = e => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    commit(fromX(e.clientX));
  };
  const onPointerMove = e => {
    if (disabled || !e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    commit(fromX(e.clientX));
  };
  const onKeyDown = e => {
    if (disabled) return;
    let nv = v;
    const big = (max - min) / 10;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nv = v + step;else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nv = v - step;else if (e.key === 'PageUp') nv = v + big;else if (e.key === 'PageDown') nv = v - big;else if (e.key === 'Home') nv = min;else if (e.key === 'End') nv = max;else return;
    e.preventDefault();
    commit(nv);
  };
  const display = formatValue ? formatValue(v) : v;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, rest), (label || showValue) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body-sm)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--text-secondary)'
    }
  }, label), showValue && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-body-sm)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--text-primary)',
      fontFeatureSettings: 'var(--num-feature)'
    }
  }, display)), /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    onPointerDown: onPointerDown,
    onPointerMove: onPointerMove,
    style: {
      position: 'relative',
      height: 24,
      display: 'flex',
      alignItems: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer',
      touchAction: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 6,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--border-strong)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      width: `${pct}%`,
      height: 6,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--brand)',
      transition: 'width var(--dur-instant) var(--ease-standard)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    role: "slider",
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuenow": v,
    "aria-label": label || 'value',
    "aria-disabled": disabled || undefined,
    tabIndex: disabled ? -1 : 0,
    onKeyDown: onKeyDown,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      position: 'absolute',
      left: `${pct}%`,
      transform: 'translateX(-50%)',
      width: 22,
      height: 22,
      borderRadius: '50%',
      background: '#fff',
      border: '1px solid var(--border-glass)',
      boxShadow: focused ? 'var(--shadow-focus)' : '0 2px 5px rgba(11,14,18,0.35)',
      outline: 'none',
      cursor: disabled ? 'not-allowed' : 'grab',
      transition: 'box-shadow var(--dur-fast) var(--ease-standard), left var(--dur-instant) var(--ease-standard)'
    }
  })));
}
Object.assign(__ds_scope, { Slider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Slider.jsx", error: String((e && e.message) || e) }); }

// components/core/Switch.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF Switch — binary toggle (e.g. "Avoid monitored roads", "Voice guidance").
 * On = Signal Green. Calm slide, no bounce.
 */
function Switch({
  checked = false,
  onChange,
  disabled = false,
  label,
  style = {},
  ...rest
}) {
  const toggle = /*#__PURE__*/React.createElement("span", {
    role: "switch",
    "aria-checked": checked,
    "aria-label": !label ? 'toggle' : undefined,
    tabIndex: disabled ? -1 : 0,
    onClick: () => !disabled && onChange && onChange(!checked),
    onKeyDown: e => {
      if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onChange && onChange(!checked);
      }
    },
    style: {
      position: 'relative',
      width: 48,
      height: 28,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-pill)',
      background: checked ? 'var(--brand)' : 'var(--border-strong)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'background var(--dur-base) var(--ease-standard)',
      WebkitTapHighlightColor: 'transparent'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: checked ? 23 : 3,
      width: 22,
      height: 22,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: '0 2px 5px rgba(11,14,18,0.35)',
      transition: 'left var(--dur-base) var(--ease-soft)'
    }
  }));
  if (!label) return React.cloneElement(toggle, {
    style: {
      ...toggle.props.style,
      ...style
    }
  });
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      cursor: disabled ? 'not-allowed' : 'pointer',
      ...style
    }
  }, rest), toggle, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--text-primary)'
    }
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// components/core/Toast.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
const TONES = {
  info: {
    icon: 'info',
    fg: 'var(--azure-600)',
    bg: 'var(--azure-100)'
  },
  success: {
    icon: 'circle-check',
    fg: 'var(--green-700)',
    bg: 'var(--green-050)'
  },
  warning: {
    icon: 'triangle-alert',
    fg: 'var(--amber-600)',
    bg: 'var(--amber-100)'
  },
  alert: {
    icon: 'triangle-alert',
    fg: 'var(--alert-600)',
    bg: 'var(--alert-100)'
  }
};

/**
 * DAF Toast — transient notification ("Re-routed to avoid 2 cameras",
 * "Offline maps updated"). Frosted card with a tinted status chip, optional
 * description + inline action, and a dismiss control. Drop them into a
 * <ToastViewport> to stack in a screen corner.
 */
function Toast({
  tone = 'info',
  // info | success | warning | alert
  title,
  description,
  action,
  // { label, onClick }
  onDismiss,
  icon,
  // override the tone's default icon name
  style = {},
  ...rest
}) {
  const t = TONES[tone] || TONES.info;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    "aria-live": "polite",
    style: {
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
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-sm)',
      background: t.bg,
      color: t.fg
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || t.icon,
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      paddingTop: 1
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--text-primary)',
      lineHeight: 1.35
    }
  }, title), description && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-secondary)',
      marginTop: 2,
      lineHeight: 1.45,
      textWrap: 'pretty'
    }
  }, description), action && /*#__PURE__*/React.createElement("button", {
    onClick: action.onClick,
    style: {
      marginTop: 10,
      padding: 0,
      border: 'none',
      background: 'transparent',
      color: 'var(--text-brand)',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body-sm)',
      fontWeight: 'var(--fw-semibold)',
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent'
    }
  }, action.label)), onDismiss && /*#__PURE__*/React.createElement("button", {
    "aria-label": "Dismiss",
    onClick: onDismiss,
    style: {
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
      WebkitTapHighlightColor: 'transparent'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 16
  })));
}

/**
 * Fixed-position stack for Toasts. Place once near the app root and render
 * your active toasts as children.
 */
function ToastViewport({
  children,
  placement = 'bottom-right',
  // top|bottom + -left|-center|-right
  style = {}
}) {
  const vy = placement.startsWith('top') ? 'top' : 'bottom';
  const hx = placement.endsWith('left') ? 'left' : placement.endsWith('center') ? 'center' : 'right';
  const pos = {
    position: 'fixed',
    zIndex: 60,
    display: 'flex',
    flexDirection: vy === 'top' ? 'column' : 'column-reverse',
    gap: 10,
    padding: 16,
    pointerEvents: 'none',
    [vy]: 0
  };
  if (hx === 'left') pos.left = 0;else if (hx === 'right') pos.right = 0;else {
    pos.left = '50%';
    pos.transform = 'translateX(-50%)';
    pos.alignItems = 'center';
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...pos,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Toast, ToastViewport });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Toast.jsx", error: String((e && e.message) || e) }); }

// components/core/Tooltip.jsx
try { (() => {
/**
 * DAF Tooltip — a small inverse-surface bubble that explains an icon-only
 * control on hover or keyboard focus. Wrap any trigger; positions on the
 * given side with a matching arrow.
 */
function Tooltip({
  content,
  side = 'top',
  // top | bottom | left | right
  delay = 120,
  children,
  style = {}
}) {
  const [show, setShow] = React.useState(false);
  const timer = React.useRef();
  const open = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(true), delay);
  };
  const close = () => {
    clearTimeout(timer.current);
    setShow(false);
  };
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const gap = 8;
  const bubble = {
    position: 'absolute',
    zIndex: 70
  };
  const arrowBase = {
    position: 'absolute',
    width: 8,
    height: 8,
    background: 'var(--surface-inverse)',
    transform: 'rotate(45deg)'
  };
  const arrow = {
    ...arrowBase
  };
  if (side === 'top') {
    bubble.bottom = '100%';
    bubble.left = '50%';
    bubble.transform = 'translateX(-50%)';
    bubble.marginBottom = gap;
    arrow.top = '100%';
    arrow.left = '50%';
    arrow.marginLeft = -4;
    arrow.marginTop = -4;
  }
  if (side === 'bottom') {
    bubble.top = '100%';
    bubble.left = '50%';
    bubble.transform = 'translateX(-50%)';
    bubble.marginTop = gap;
    arrow.bottom = '100%';
    arrow.left = '50%';
    arrow.marginLeft = -4;
    arrow.marginBottom = -4;
  }
  if (side === 'left') {
    bubble.right = '100%';
    bubble.top = '50%';
    bubble.transform = 'translateY(-50%)';
    bubble.marginRight = gap;
    arrow.left = '100%';
    arrow.top = '50%';
    arrow.marginTop = -4;
    arrow.marginLeft = -4;
  }
  if (side === 'right') {
    bubble.left = '100%';
    bubble.top = '50%';
    bubble.transform = 'translateY(-50%)';
    bubble.marginLeft = gap;
    arrow.right = '100%';
    arrow.top = '50%';
    arrow.marginTop = -4;
    arrow.marginRight = -4;
  }
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      ...style
    },
    onMouseEnter: open,
    onMouseLeave: close,
    onFocus: open,
    onBlur: close
  }, children, /*#__PURE__*/React.createElement("span", {
    role: "tooltip",
    style: {
      ...bubble,
      opacity: show ? 1 : 0,
      visibility: show ? 'visible' : 'hidden',
      transition: 'opacity var(--dur-fast) var(--ease-standard)',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      background: 'var(--surface-inverse)',
      color: 'var(--text-inverse)',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body-sm)',
      fontWeight: 'var(--fw-semibold)',
      lineHeight: 1.3,
      padding: '6px 10px',
      borderRadius: 'var(--radius-sm)',
      boxShadow: 'var(--shadow-float)'
    }
  }, content, /*#__PURE__*/React.createElement("span", {
    style: arrow
  })));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/map/BottomSheet/BottomSheet.jsx
try { (() => {
/**
 * DAF BottomSheet — the frosted sheet that rises from the bottom edge to hold
 * route comparisons, place details, and marker info over the map.
 */
function BottomSheet({
  children,
  title = null,
  subtitle = null,
  trailing = null,
  // header trailing control (e.g. close)
  grabber = true,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--surface-sheet)',
      borderTopLeftRadius: 'var(--radius-sheet)',
      borderTopRightRadius: 'var(--radius-sheet)',
      borderTop: '1px solid var(--border-glass)',
      boxShadow: 'var(--shadow-sheet)',
      padding: '8px var(--space-4) var(--space-5)',
      color: 'var(--text-primary)',
      ...style
    }
  }, grabber && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      paddingBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 'var(--sheet-grab)',
      height: 5,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--border-strong)'
    }
  })), (title || trailing) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: subtitle ? 4 : 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--fs-h3)',
      fontWeight: 'var(--fw-bold)',
      letterSpacing: 'var(--ls-heading)',
      color: 'var(--text-primary)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-secondary)',
      marginTop: 2
    }
  }, subtitle)), trailing && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 auto'
    }
  }, trailing)), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 10
    }
  }), children);
}
Object.assign(__ds_scope, { BottomSheet });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/BottomSheet/BottomSheet.jsx", error: String((e && e.message) || e) }); }

// components/map/MapMarker/MapMarker.jsx
try { (() => {
/* ~40°-wide pie-slice "cone of view", apex at the dot centre, aimed up by
   default and rotated to `heading`. Fades from solid at the apex to
   transparent at the far edge — large relative to the dot it springs from. */
function Cone({
  heading = 0,
  fill,
  edge,
  size = 132
}) {
  const gid = React.useId().replace(/[:]/g, '');
  // viewBox 100×100, centre (50,50). Up = -90°, half-angle 20° → edges at -110°/-70°.
  const d = 'M50 50 L34.3 6.8 A46 46 0 0 1 65.7 6.8 Z';
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 100 100",
    width: size,
    height: size,
    style: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: `translate(-50%,-50%) rotate(${heading}deg)`,
      pointerEvents: 'none',
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("radialGradient", {
    id: `cone-${gid}`,
    cx: "50%",
    cy: "50%",
    r: "50%"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: fill,
    stopOpacity: "0.95"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "55%",
    stopColor: fill,
    stopOpacity: "0.55"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: fill,
    stopOpacity: "0.04"
  }))), /*#__PURE__*/React.createElement("path", {
    d: d,
    fill: `url(#cone-${gid})`,
    stroke: edge,
    strokeWidth: "0.9",
    strokeLinejoin: "round"
  }));
}

/* Bottom-center anchored teardrop pin with a large, centered glyph in its head. */
function Pin({
  fill,
  ink,
  iconName,
  icon,
  size = 46
}) {
  const headIcon = icon || (iconName ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconName,
    size: size * 0.48,
    color: ink
  }) : null);
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-block',
      width: size,
      height: size * 1.32
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 44 58",
    width: size,
    height: size * 1.32,
    style: {
      filter: 'drop-shadow(0 4px 8px rgba(11,14,18,0.4))',
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M22 1C10.7 1 1.5 10.1 1.5 21.4 1.5 36.5 22 57 22 57s20.5-20.5 20.5-35.6C42.5 10.1 33.3 1 22 1Z",
    fill: fill,
    stroke: "var(--surface-marker)",
    strokeWidth: "2"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: `${22 / 58 * 100}%`,
      left: '50%',
      transform: 'translate(-50%,-50%)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: ink
    }
  }, headIcon));
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
function MapMarker({
  variant = 'place',
  icon = null,
  // custom glyph node (place/destination)
  iconName = null,
  // or a DAF Icon name
  count = 0,
  // cluster
  heading = 0,
  // cone / heading direction (deg, 0 = up)
  selected = false,
  inactive = false,
  label = null,
  style = {}
}) {
  const dim = inactive ? 0.45 : 1;
  const scale = selected ? 1.14 : 1;
  let node;
  if (variant === 'user') {
    node = /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 64,
        height: 64
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        background: 'var(--marker-user-halo)'
      }
    }), /*#__PURE__*/React.createElement(Cone, {
      heading: heading,
      fill: "var(--marker-user-cone)",
      edge: "var(--marker-user-cone-edge)",
      size: 84
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative',
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: 'var(--marker-user)',
        border: '3px solid var(--surface-marker)',
        boxShadow: 'var(--shadow-marker)'
      }
    }));
  } else if (variant === 'alpr' || variant === 'camera') {
    const dot = 15;
    node = /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 132,
        height: 132
      }
    }, variant === 'camera' && /*#__PURE__*/React.createElement(Cone, {
      heading: heading,
      fill: "var(--marker-cone-edge)",
      edge: "var(--marker-cone-edge)",
      size: 132
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        width: dot * 2.6,
        height: dot * 2.6,
        borderRadius: '50%',
        background: `radial-gradient(circle, var(--marker-alpr-glow) 0%, transparent 70%)`,
        pointerEvents: 'none'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative',
        width: dot,
        height: dot,
        borderRadius: '50%',
        background: 'var(--marker-alpr)',
        border: `${selected ? 3 : 2}px solid #fff`,
        boxShadow: '0 1px 4px rgba(11,14,18,0.5)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        inset: '24%',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.55)'
      }
    })));
  } else if (variant === 'police' || variant === 'police-hidden') {
    const hidden = variant === 'police-hidden';
    const badge = 26;
    node = /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 132,
        height: 132
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        width: badge * 2.2,
        height: badge * 2.2,
        borderRadius: '50%',
        background: `radial-gradient(circle, var(--marker-police-glow) 0%, transparent 70%)`,
        opacity: hidden ? 0.55 : 1,
        pointerEvents: 'none'
      }
    }), hidden ? /*#__PURE__*/React.createElement("span", {
      style: {
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
        color: 'var(--marker-police)'
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "shield",
      size: 14,
      stroke: 2.4
    })) : /*#__PURE__*/React.createElement("span", {
      style: {
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
        color: '#fff'
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "shield",
      size: 13,
      stroke: 2.6
    })));
  } else if (variant === 'cluster') {
    node = /*#__PURE__*/React.createElement("span", {
      style: {
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
        boxShadow: selected ? '0 0 0 4px rgba(255,77,79,0.35), var(--shadow-marker)' : 'var(--shadow-marker)'
      }
    }, count);
  } else if (variant === 'monitored') {
    node = /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: 'var(--surface-marker)',
        border: '4px solid var(--node-monitored)',
        boxShadow: 'var(--shadow-marker)'
      }
    });
  } else if (variant === 'destination') {
    node = /*#__PURE__*/React.createElement(Pin, {
      fill: "var(--marker-destination)",
      ink: "#fff",
      icon: icon,
      iconName: iconName || 'flag'
    });
  } else {
    // place
    node = /*#__PURE__*/React.createElement(Pin, {
      fill: "var(--marker-place)",
      ink: "var(--marker-place-ink)",
      icon: icon,
      iconName: iconName || 'star'
    });
  }
  const ringWrap = selected && (variant === 'place' || variant === 'destination') ? {
    filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))'
  } : {};
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      opacity: dim,
      transform: `scale(${scale})`,
      transformOrigin: 'bottom center',
      transition: 'transform var(--dur-base) var(--ease-soft), opacity var(--dur-base) var(--ease-standard)',
      ...ringWrap,
      ...style
    }
  }, node, label && /*#__PURE__*/React.createElement("span", {
    style: {
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
      backdropFilter: 'blur(var(--blur-soft))'
    }
  }, label));
}
Object.assign(__ds_scope, { MapMarker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/MapMarker/MapMarker.jsx", error: String((e && e.message) || e) }); }

// components/map/NavBanner/NavBanner.jsx
try { (() => {
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
  arrive: 'flag'
};

/**
 * DAF NavBanner — turn-by-turn instruction banner for active navigation.
 * Calm, high-contrast, large maneuver arrow. Pins to the top of the screen.
 */
function NavBanner({
  maneuver = 'right',
  distance = '500 ft',
  instruction = 'Turn right onto Market St',
  then = null,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
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
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 52,
      height: 52,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-md)',
      background: 'var(--brand)',
      color: 'var(--brand-contrast)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: MANEUVERS[maneuver] || MANEUVERS.right,
    size: 30,
    stroke: 2.4
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-h2)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-primary)',
      lineHeight: 1.05,
      fontFeatureSettings: 'var(--num-feature)'
    }
  }, distance), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body-lg)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--text-secondary)',
      marginTop: 2,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, instruction)), then && /*#__PURE__*/React.createElement("span", {
    style: {
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
      fontWeight: 'var(--fw-semibold)'
    }
  }, then));
}
Object.assign(__ds_scope, { NavBanner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/NavBanner/NavBanner.jsx", error: String((e && e.message) || e) }); }

// components/map/RouteCard/RouteCard.jsx
try { (() => {
/* Mini route-line swatch — solid green (private) vs solid azure (fast).
   Both are solid lines; the two read apart by color + icon + label. */
function RouteSwatch({
  kind
}) {
  const color = kind === 'private' ? 'var(--route-private)' : 'var(--route-fast)';
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 40 12",
    width: 40,
    height: 12,
    "aria-hidden": true
  }, /*#__PURE__*/React.createElement("line", {
    x1: "2",
    y1: "6",
    x2: "38",
    y2: "6",
    stroke: "#fff",
    strokeWidth: "9",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "2",
    y1: "6",
    x2: "38",
    y2: "6",
    stroke: color,
    strokeWidth: "6",
    strokeLinecap: "round"
  }));
}

/**
 * DAF RouteCard — one selectable route option in the route-comparison sheet.
 * Fastest (solid azure + bolt) vs Private (solid green + shield) — both solid
 * lines, told apart by color + icon + label.
 */
function RouteCard({
  kind = 'fast',
  // fast | private
  eta,
  // "24 min"
  arrival,
  // "arrive 6:12"
  distance,
  // "12.4 mi"
  cameras = 0,
  // ALPR count on this route
  selected = false,
  recommended = false,
  onClick,
  style = {}
}) {
  const isPrivate = kind === 'private';
  const accent = isPrivate ? 'var(--route-private)' : 'var(--route-fast)';
  const title = isPrivate ? 'Private route' : 'Fastest route';
  const glyph = isPrivate ? 'shield-check' : 'zap';
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    "aria-pressed": selected,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      textAlign: 'left',
      padding: 'var(--space-3)',
      background: 'var(--surface-glass)',
      border: `1.5px solid ${selected ? accent : 'var(--border-glass)'}`,
      borderRadius: 'var(--radius-md)',
      boxShadow: selected ? `0 0 0 3px ${isPrivate ? 'rgba(31,191,107,0.18)' : 'rgba(46,139,255,0.18)'}, var(--shadow-float)` : 'var(--shadow-float)',
      backdropFilter: 'blur(var(--blur-glass))',
      WebkitBackdropFilter: 'blur(var(--blur-glass))',
      cursor: 'pointer',
      transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 42,
      height: 42,
      flex: '0 0 auto',
      borderRadius: 'var(--radius-sm)',
      background: isPrivate ? 'rgba(31,191,107,0.16)' : 'rgba(46,139,255,0.16)',
      color: accent
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: glyph,
    size: 22
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-primary)'
    }
  }, title), recommended && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-label)',
      fontWeight: 'var(--fw-bold)',
      letterSpacing: 'var(--ls-label)',
      textTransform: 'uppercase',
      color: 'var(--brand-contrast)',
      background: 'var(--brand)',
      padding: '2px 7px',
      borderRadius: 'var(--radius-pill)'
    }
  }, "Pick")), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body-sm)',
      color: 'var(--text-secondary)'
    }
  }, /*#__PURE__*/React.createElement(RouteSwatch, {
    kind: kind
  }), /*#__PURE__*/React.createElement("span", null, distance), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      opacity: 0.4
    }
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      color: cameras === 0 ? 'var(--text-brand)' : 'var(--alert-500)',
      fontWeight: 'var(--fw-semibold)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: cameras === 0 ? 'check' : 'scan-eye',
    size: 14
  }), cameras === 0 ? 'No cameras' : `${cameras} camera${cameras > 1 ? 's' : ''}`))), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-h3)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-primary)',
      lineHeight: 1.1,
      fontFeatureSettings: 'var(--num-feature)'
    }
  }, eta), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-caption)',
      color: 'var(--text-tertiary)'
    }
  }, arrival)));
}
Object.assign(__ds_scope, { RouteCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/RouteCard/RouteCard.jsx", error: String((e && e.message) || e) }); }

// components/map/SearchBar/SearchBar.jsx
try { (() => {
/**
 * DAF SearchBar — the primary "Where to?" affordance floating at the top of
 * the map. A low-profile glass pill that can carry, left-to-right: a leading
 * hamburger (menu) button, the search glyph, the input, a clear (✕) button
 * that appears once text is entered, and a divider-separated directions
 * button on the trailing edge. Each control is opt-in via its handler prop.
 */
function SearchBar({
  placeholder = 'Where to?',
  value,
  onChange,
  onFocus,
  onMenu,
  // hamburger handler — renders the leading menu button
  onVoice,
  // voice handler — renders the mic button before the directions divider
  onClear,
  // clear handler — renders the ✕ button while the input has text
  onDirections,
  // directions handler — renders the divider-separated directions button
  leading,
  // override the default search glyph
  trailing = null,
  // extra node injected before the directions button
  readOnly = false,
  style = {}
}) {
  const hasValue = value != null && String(value).length > 0;
  const IconBtn = ({
    name,
    label,
    tone = 'var(--text-secondary)',
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": label,
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 auto',
      width: 36,
      height: 36,
      padding: 0,
      border: 'none',
      background: 'transparent',
      borderRadius: 'var(--radius-pill)',
      color: tone,
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
      transition: 'background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)'
    },
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--border-glass-2)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseDown: e => {
      e.currentTarget.style.transform = 'scale(var(--press-scale))';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: name,
    size: 20
  }));
  const Divider = () => /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      flex: '0 0 auto',
      width: 1,
      height: 24,
      background: 'var(--border-glass)'
    }
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      height: 52,
      padding: '0 6px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--surface-glass)',
      border: '1px solid var(--border-glass)',
      boxShadow: 'var(--shadow-float)',
      backdropFilter: 'blur(var(--blur-glass))',
      WebkitBackdropFilter: 'blur(var(--blur-glass))',
      ...style
    }
  }, onMenu && /*#__PURE__*/React.createElement(IconBtn, {
    name: "menu",
    label: "Open menu",
    tone: "var(--text-primary)",
    onClick: onMenu
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flex: '0 0 auto',
      color: 'var(--text-tertiary)',
      marginLeft: onMenu ? 2 : 8
    }
  }, leading || /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 18
  })), /*#__PURE__*/React.createElement("input", {
    value: value,
    onChange: onChange,
    onFocus: onFocus,
    placeholder: placeholder,
    readOnly: readOnly,
    style: {
      flex: 1,
      minWidth: 0,
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--fs-body)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--text-primary)',
      cursor: readOnly ? 'pointer' : 'text'
    }
  }), hasValue && onClear && /*#__PURE__*/React.createElement(IconBtn, {
    name: "x",
    label: "Clear search",
    tone: "var(--text-tertiary)",
    onClick: onClear
  }), trailing && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      flex: '0 0 auto'
    }
  }, trailing), onVoice && /*#__PURE__*/React.createElement(IconBtn, {
    name: "mic",
    label: "Voice search",
    tone: "var(--text-secondary)",
    onClick: onVoice
  }), onDirections && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Divider, null), /*#__PURE__*/React.createElement(IconBtn, {
    name: "corner-up-right",
    label: "Directions",
    tone: "var(--text-primary)",
    onClick: onDirections
  })));
}
Object.assign(__ds_scope, { SearchBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/SearchBar/SearchBar.jsx", error: String((e && e.message) || e) }); }

// components/map/SpeedLimitBadge/SpeedLimitBadge.jsx
try { (() => {
// Named size presets — `size` also accepts any raw px number.
const SIZES = {
  sm: 44,
  md: 58,
  lg: 80
};

/**
 * DAF SpeedLimitBadge — posted limit on a white US-style sign, with an optional
 * live current-speed read-out tucked into the BOTTOM corner. The read-out is a
 * calm gray at or under the posted limit and hardens to black when you're over.
 *
 * The sign is a real-world object, so it stays white in BOTH themes (it reads
 * `--speed-*` tokens, which are pinned light-and-dark in colors.css).
 */
function SpeedLimitBadge({
  limit = 35,
  current = null,
  size = 'md',
  unit = 'mph',
  style = {}
}) {
  const px = typeof size === 'number' ? size : SIZES[size] || SIZES.md;
  const hasCurrent = current !== null && current !== undefined;
  const over = hasCurrent && Number(current) > Number(limit);

  // Geometry derives from `px` (the sign width).
  const signH = px * 1.2;
  const ring = Math.max(3, px * 0.07);
  const dial = px * 0.46;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-block',
      width: px,
      height: signH + dial * 0.5,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: px,
      height: signH,
      background: '#FFFFFF',
      border: `${Math.max(2, px * 0.045)}px solid #11151B`,
      borderRadius: px * 0.14,
      boxShadow: 'var(--shadow-marker)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: size * 0.04,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 800,
      fontSize: px * 0.15,
      lineHeight: 1.02,
      letterSpacing: '0.04em',
      color: '#11151B',
      textAlign: 'center',
      textTransform: 'uppercase'
    }
  }, "Speed", /*#__PURE__*/React.createElement("br", null), "Limit"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontWeight: 800,
      fontSize: px * 0.46,
      lineHeight: 0.92,
      color: '#11151B',
      fontFeatureSettings: 'var(--num-feature)'
    }
  }, limit)), hasCurrent && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: -dial * 0.5,
      width: dial,
      height: dial,
      borderRadius: '50%',
      background: '#FFFFFF',
      border: `${ring}px solid ${over ? 'var(--speed-over)' : 'var(--speed-limit-ring)'}`,
      boxShadow: 'var(--shadow-marker)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-mono)',
      fontWeight: 800,
      fontSize: dial * 0.46,
      lineHeight: 1,
      color: over ? 'var(--speed-over)' : 'var(--speed-ok)',
      fontFeatureSettings: 'var(--num-feature)'
    }
  }, current));
}
Object.assign(__ds_scope, { SpeedLimitBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/SpeedLimitBadge/SpeedLimitBadge.jsx", error: String((e && e.message) || e) }); }

// components/site/SiteHeader.jsx
try { (() => {
function _extends() {
  return _extends = Object.assign ? Object.assign.bind() : function (n) {
    for (var e = 1; e < arguments.length; e++) {
      var t = arguments[e];
      for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
    }
    return n;
  }, _extends.apply(null, arguments);
}
/**
 * DAF SiteHeader — top navigation bar shared across the marketing and app pages.
 *
 * Two chrome variants:
 *  - "marketing": translucent glass, sticky, content-width container, larger
 *    logo with a soft shadow. Used on the landing page.
 *  - "app": opaque card surface with a drop shadow, full-bleed, slightly smaller
 *    logo, non-wrapping brand. Used on the full-screen map.
 *
 * Links and the optional CTA are passed in so each page keeps its own targets,
 * labels, and whether a call-to-action shows at all.
 */

const VARIANTS = {
  marketing: {
    header: {
      position: 'sticky',
      top: 0,
      zIndex: 50,
      background: 'var(--surface-glass-2)',
      backdropFilter: 'blur(var(--blur-glass))',
      WebkitBackdropFilter: 'blur(var(--blur-glass))',
      borderBottom: '1px solid var(--border)'
    },
    container: {
      maxWidth: 'var(--width-content)',
      margin: '0 auto',
      height: 68
    },
    logoSize: 34,
    logoShadow: true,
    brandNoWrap: false
  },
  app: {
    header: {
      flex: '0 0 auto',
      position: 'relative',
      zIndex: 60,
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border)',
      boxShadow: 'var(--shadow-card)'
    },
    container: {
      height: 64
    },
    logoSize: 32,
    logoShadow: true,
    brandNoWrap: true
  }
};
function NavLink({
  href,
  children
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", {
    href: href,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      color: hover ? 'var(--text-primary)' : 'inherit',
      textDecoration: 'none',
      transition: 'color var(--dur-base) var(--ease-standard)'
    }
  }, children);
}
function SiteHeader({
  variant = 'marketing',
  logoSrc = '../../assets/logo-mark.png',
  brand = 'Drivers Against Flock',
  logoHref = '#top',
  links = [],
  cta = null,
  style = {},
  ...rest
}) {
  const v = VARIANTS[variant] || VARIANTS.marketing;
  return /*#__PURE__*/React.createElement("header", _extends({
    style: {
      ...v.header,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24,
      padding: '0 24px',
      ...v.container
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: logoHref,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      textDecoration: 'none',
      color: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: logoSrc,
    alt: "DAF",
    style: {
      width: v.logoSize,
      height: v.logoSize,
      objectFit: 'contain',
      display: 'block',
      borderRadius: 'var(--radius-sm)',
      boxShadow: v.logoShadow ? '0px 0px 2px 0px rgba(11,14,18,0.14)' : 'none'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 17,
      letterSpacing: 'var(--ls-heading)',
      whiteSpace: v.brandNoWrap ? 'nowrap' : 'normal'
    }
  }, brand)), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 28,
      fontSize: 'var(--fs-body-sm)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--text-secondary)'
    }
  }, links.map((l, i) => /*#__PURE__*/React.createElement(NavLink, {
    key: i,
    href: l.href
  }, l.label)), cta && /*#__PURE__*/React.createElement("a", {
    href: cta.href,
    style: {
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "primary",
    size: "sm"
  }, cta.label)))));
}
Object.assign(__ds_scope, { SiteHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/site/SiteHeader.jsx", error: String((e && e.message) || e) }); }

// ios-frame.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports (to window): IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard
//
// Usage — wrap your screen content in <IOSDevice> to get the bezel, status bar
// and home indicator (props: title, dark, keyboard):
//
//   <IOSDevice title="Settings">
//     ...your screen content...
//   </IOSDevice>
//   <IOSDevice dark title="Search" keyboard>…</IOSDevice>
/* END USAGE */

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ios-frame.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.ButtonGroup = __ds_scope.ButtonGroup;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Combobox = __ds_scope.Combobox;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.AlertDialog = __ds_scope.AlertDialog;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.ICON_NAMES = __ds_scope.ICON_NAMES;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.RadioGroup = __ds_scope.RadioGroup;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Slider = __ds_scope.Slider;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.ToastViewport = __ds_scope.ToastViewport;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.BottomSheet = __ds_scope.BottomSheet;

__ds_ns.MapMarker = __ds_scope.MapMarker;

__ds_ns.NavBanner = __ds_scope.NavBanner;

__ds_ns.RouteCard = __ds_scope.RouteCard;

__ds_ns.SearchBar = __ds_scope.SearchBar;

__ds_ns.SpeedLimitBadge = __ds_scope.SpeedLimitBadge;

__ds_ns.SiteHeader = __ds_scope.SiteHeader;

})();
