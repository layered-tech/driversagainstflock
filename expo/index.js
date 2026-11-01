import '@iternio/react-native-auto-play/installTimers';
import './lib/crashlytics';
import 'react-native-gesture-handler';
import './global.css';

import { AppRegistry, LogBox } from 'react-native';
import { IS_AUTOMOTIVE } from './lib/app-target';
import registerAutoPlay from './components/auto-play';
import { startPresenceRuntime } from './components/map/alpr-presence-runtime';
import './components/map/road-matching-session';
import { loadSearchSavedLocations } from './components/map/saved-locations';
import { initializeScorecardRuntime } from './components/scorecard/scorecard-runtime-instance';

LogBox.ignoreLogs([
    'InteractionManager has been deprecated and will be removed in a future release.',
]);

void initializeScorecardRuntime();
if (!IS_AUTOMOTIVE) {
    require('./components/watch/watch-runtime').initializeWatchRuntime();
}
void loadSearchSavedLocations().catch(() => {});
startPresenceRuntime();

if (IS_AUTOMOTIVE) {
    AppRegistry.registerComponent(
        'main',
        () =>
            require('./components/automotive/setup-screen')
                .AutomotiveSetupScreen,
    );
} else {
    require('expo-router/entry');
}

registerAutoPlay();
