import {
    PersistentMapScene,
    usePersistentMapEnabled,
} from '../../components/map/persistent-map-host';
import { Stack } from 'expo-router/stack';
import { duoPaneScreenLayout } from '../../components/root/duo-pane-screen';

export default function ContributeLayout() {
    const persistentMap = usePersistentMapEnabled();
    return (
        <Stack
            screenLayout={({ children }) => (
                <PersistentMapScene>
                    {duoPaneScreenLayout({ children })}
                </PersistentMapScene>
            )}
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
