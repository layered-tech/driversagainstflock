import 'react-native-gesture-handler';
import './global.css';

import { LogBox } from 'react-native';
import registerAutoPlay from './components/auto-play';
import './components/map/road-matching-session';

LogBox.ignoreLogs([
    'InteractionManager has been deprecated and will be removed in a future release.',
]);

require('expo-router/entry');

registerAutoPlay();
