import { areaRequest, hasAreaDevice } from '../areas/areas-api';
import { getWatchAreas, setWatchAreas } from './watch-shared-state';
import { projectWatchAreas } from './watch-projections';

let refreshPromise = null;
export async function refreshWatchAreas({ force = false } = {}) {
    if (refreshPromise) {
        return force
            ? refreshPromise.then(() => refreshWatchAreas())
            : refreshPromise;
    }
    refreshPromise = (async () => {
        try {
            if (!(await hasAreaDevice())) {
                setWatchAreas(projectWatchAreas([], {}, Date.now()));
                return;
            }
            const { areas } = await areaRequest('?window=7');
            if (getWatchAreas().status === 'loading') {
                setWatchAreas(projectWatchAreas(areas, {}, Date.now()));
            }
            const feeds = {};
            for (let index = 0; index < areas.length; index += 3) {
                await Promise.all(
                    areas.slice(index, index + 3).map(async (area) => {
                        try {
                            feeds[area.id] = await areaRequest(
                                `/${area.id}/changes?window=7&page=1`,
                            );
                        } catch {
                            feeds[area.id] = null;
                        }
                    }),
                );
            }
            setWatchAreas(projectWatchAreas(areas, feeds, Date.now()));
        } catch (error) {
            const previous = getWatchAreas();
            setWatchAreas({
                ...previous,
                status: error.message.includes('session expired')
                    ? 'expired'
                    : 'offline',
            });
        }
    })().finally(() => {
        refreshPromise = null;
    });
    return refreshPromise;
}

export async function markWatchAreaRead(areaId) {
    if (!getWatchAreas().items.some((item) => item.id === areaId)) {
        await refreshWatchAreas();
    }
    const area = getWatchAreas().items.find((item) => item.id === areaId);
    if (!area?.readThroughId) return false;
    await areaRequest(`/${areaId}/read`, {
        method: 'POST',
        body: { through_id: area.readThroughId },
    });
    await refreshWatchAreas({ force: true });
    return true;
}
