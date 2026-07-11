import 'react-native-gesture-handler';
import './global.css';

import { LogBox } from 'react-native';
import registerAutoPlay from './components/auto-play';

LogBox.ignoreLogs([
    'InteractionManager has been deprecated and will be removed in a future release.',
]);

require('expo-router/entry');

registerAutoPlay();
