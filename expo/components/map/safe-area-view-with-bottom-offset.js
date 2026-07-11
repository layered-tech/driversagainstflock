import { SafeAreaView } from 'react-native-safe-area-context';
import { getSafeAreaBottomOffset } from '../../lib/safe-area-insets';

function hasSafeAreaEdge(edges, edge) {
    return (
        !edges ||
        (Array.isArray(edges) ? edges.includes(edge) : Boolean(edges[edge]))
    );
}

export function SafeAreaViewWithBottomOffset({ edges, style, ...props }) {
    const bottomOffset = getSafeAreaBottomOffset();
    const hasBottomEdge = hasSafeAreaEdge(edges, 'bottom');

    return (
        <SafeAreaView
            edges={edges}
            style={[
                bottomOffset > 0 && hasBottomEdge
                    ? { paddingBottom: bottomOffset }
                    : null,
                style,
            ]}
            {...props}
        />
    );
}
