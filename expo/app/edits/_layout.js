import { Stack } from 'expo-router/stack';
import {
    ResponsiveMapWorkspace,
    WorkspaceMap,
} from '../../components/map/responsive-map-workspace';
import { useContribute } from '../../components/contribute/contribute-state';

export default function EditsLayout() {
    const { pins, removals } = useContribute();
    return (
        <ResponsiveMapWorkspace
            map={<WorkspaceMap pins={pins} removals={removals} />}
        >
            <Stack screenOptions={{ headerShown: false }} />
        </ResponsiveMapWorkspace>
    );
}
