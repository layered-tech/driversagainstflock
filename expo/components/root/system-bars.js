import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';

export const LIGHT_SYSTEM_BAR_BACKGROUND = '#ffffff';
export const DARK_SYSTEM_BAR_BACKGROUND = '#0a0a0a';

export function SystemBars() {
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';
    const backgroundColor = isDarkMode
        ? DARK_SYSTEM_BAR_BACKGROUND
        : LIGHT_SYSTEM_BAR_BACKGROUND;

    useEffect(() => {
        SystemUI.setBackgroundColorAsync(backgroundColor).catch(() => {});

        if (Platform.OS !== 'android') {
            return;
        }

        NavigationBar.setStyle('auto');
        NavigationBar.setVisibilityAsync('visible').catch(() => {});
    }, [backgroundColor]);

    return (
        <StatusBar
            animated
            backgroundColor={backgroundColor}
            style={isDarkMode ? 'light' : 'dark'}
        />
    );
}
