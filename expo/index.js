import '@iternio/react-native-auto-play/installTimers';
import './lib/crashlytics';
import 'react-native-gesture-handler';
import './global.css';

import { LogBox } from 'react-native';
import registerAutoPlay from './components/auto-play';
import { startPresenceRuntime } from './components/map/alpr-presence-runtime';
import './components/map/road-matching-session';
import { loadSearchSavedLocations } from './components/map/saved-locations';
import { initializeScorecardRuntime } from './components/scorecard/scorecard-runtime-instance';
import { initializeWatchRuntime } from './components/watch/watch-runtime';

LogBox.ignoreLogs([
    'InteractionManager has been deprecated and will be removed in a future release.',
]);

void initializeScorecardRuntime();
initializeWatchRuntime();
void loadSearchSavedLocations().catch(() => {});
startPresenceRuntime();

require('expo-router/entry');

registerAutoPlay();
