import { Stack } from 'expo-router/stack';
import { useGlobalSearchParams } from 'expo-router';
import {
    ResponsiveMapWorkspace,
    WorkspaceMap,
} from '../../components/map/responsive-map-workspace';
import { useContribute } from '../../components/contribute/contribute-state';

export default function ContributeLayout() {
    const { pins, removals } = useContribute();
    const { index } = useGlobalSearchParams();
    const pin = pins[Number(index)];
    const focusCoordinate = pin ? [pin.longitude, pin.latitude] : null;
    return (
        <ResponsiveMapWorkspace
            map={
                <WorkspaceMap
                    pins={pins}
                    removals={removals}
                    focusCoordinate={focusCoordinate}
                />
            }
        >
            <Stack screenOptions={{ headerShown: false }} />
        </ResponsiveMapWorkspace>
    );
}
