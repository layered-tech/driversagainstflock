const DAF_THEME_STORAGE_KEY = 'daf-theme';
const DAF_THEMES = ['light', 'dark'];

function themeIsSupported(theme) {
    return DAF_THEMES.includes(theme);
}

export function getStoredDafTheme() {
    if (typeof window === 'undefined') {
        return null;
    }

    const storedTheme = window.localStorage.getItem(DAF_THEME_STORAGE_KEY);

    return themeIsSupported(storedTheme) ? storedTheme : null;
}

export function getSystemDafTheme() {
    if (typeof window === 'undefined') {
        return 'light';
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}

export function getActiveDafTheme() {
    if (typeof document === 'undefined') {
        return 'light';
    }

    const documentTheme = document.documentElement.dataset.theme;

    return themeIsSupported(documentTheme)
        ? documentTheme
        : getSystemDafTheme();
}

export function applyDafTheme(theme, { persist = true } = {}) {
    const nextTheme = themeIsSupported(theme) ? theme : getSystemDafTheme();

    if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    }

    if (persist && typeof window !== 'undefined') {
        window.localStorage.setItem(DAF_THEME_STORAGE_KEY, nextTheme);
    }

    return nextTheme;
}

export function applySystemDafTheme() {
    if (typeof window !== 'undefined') {
        window.localStorage.removeItem(DAF_THEME_STORAGE_KEY);
    }

    return applyDafTheme(getSystemDafTheme(), {
        persist: false,
    });
}

export function toggleDafTheme() {
    return applyDafTheme(getActiveDafTheme() === 'dark' ? 'light' : 'dark');
}

export function bootDafTheme() {
    return applyDafTheme(getStoredDafTheme() ?? getSystemDafTheme(), {
        persist: false,
    });
}
