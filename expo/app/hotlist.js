import HotlistScreen from '../components/hotlist-screen';
import { DuoPaneScreen } from '../components/root/duo-pane-screen';

export default function Hotlist() {
    return (
        <DuoPaneScreen>
            <HotlistScreen />
        </DuoPaneScreen>
    );
}
