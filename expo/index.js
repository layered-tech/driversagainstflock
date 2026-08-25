import 'react-native-gesture-handler';
import './global.css';

import { LogBox } from 'react-native';
import registerAutoPlay from './components/auto-play';
import './components/map/road-matching-session';
import { initializeScorecardRuntime } from './components/scorecard/scorecard-runtime-instance';

LogBox.ignoreLogs([
    'InteractionManager has been deprecated and will be removed in a future release.',
]);

void initializeScorecardRuntime();

require('expo-router/entry');

registerAutoPlay();
