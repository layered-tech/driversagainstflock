import {
    PersistentMapScene,
    usePersistentMapEnabled,
} from '../../components/map/persistent-map-host';
import { Stack } from 'expo-router/stack';
import { DuoPaneScreen } from '../../components/root/duo-pane-screen';

function screenLayout({ children, route }) {
    return (
        <PersistentMapScene>
            {['index', 'timeline'].includes(route.name) ? (
                <DuoPaneScreen>{children}</DuoPaneScreen>
            ) : (
                children
            )}
        </PersistentMapScene>
    );
}

export default function ScorecardLayout() {
    const persistentMap = usePersistentMapEnabled();
    return (
        <Stack
            screenLayout={screenLayout}
            screenOptions={{
                headerShown: false,
                contentStyle: {
                    pointerEvents: persistentMap ? 'box-none' : 'auto',
                    backgroundColor: persistentMap ? 'transparent' : undefined,
                },
            }}
        />
    );
}
