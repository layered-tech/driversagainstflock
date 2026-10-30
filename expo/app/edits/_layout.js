import {
    PersistentMapScene,
    usePersistentMapEnabled,
} from '../../components/map/persistent-map-host';
import { Stack } from 'expo-router/stack';
import {
    DuoMapModalScreen,
    duoPaneScreenLayout,
} from '../../components/root/duo-pane-screen';

export function editScreenLayout({ children, route }) {
    return (
        <PersistentMapScene>
            {route.params?.action === 'remove' ? (
                <DuoMapModalScreen>{children}</DuoMapModalScreen>
            ) : (
                duoPaneScreenLayout({ children })
            )}
        </PersistentMapScene>
    );
}

export default function EditsLayout() {
    const persistentMap = usePersistentMapEnabled();
    return (
        <Stack
            screenLayout={editScreenLayout}
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
