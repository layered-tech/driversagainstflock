import * as displaySpeed from '../display-speed-state.js';
import * as speedLimitLayout from '../speed-limit-layout.js';
import { loadTourModule } from './tour-test-helpers.mjs';

export function loadSpeedDisplayModules(react) {
    const hook = loadTourModule(
        new URL('../use-display-speed.js', import.meta.url),
        { react, './display-speed-state': displaySpeed },
    );

    return loadTourModule(new URL('../speed-limit.js', import.meta.url), {
        react,
        'react-native': {
            Platform: { OS: 'android' },
            Text: 'Text',
            View: 'View',
        },
        './api-mocks': { mapApiMocksAreEnabled: () => false },
        './speed-limit-layout': speedLimitLayout,
        './speed-limit-mock': {},
        './display-speed-state': displaySpeed,
        './use-display-speed': hook,
    });
}
