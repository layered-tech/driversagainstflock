import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StackRouter } from '@react-navigation/routers';
import { openDrawerRoot } from '../../root/app-drawer-navigation.js';

for (const routeName of ['areas', 'edits', 'scorecard']) {
    for (const hasIndex of [false, true])
        test(`${routeName} opens its list from a stale detail route, existing index ${hasIndex}`, () => {
            const router = StackRouter({});
            const options = {
                routeNames: ['index', 'detail'],
                routeParamList: {},
                routeGetIdList: {},
            };
            let stack = router.getInitialState(options);
            stack = {
                ...stack,
                routes: [
                    ...(hasIndex ? stack.routes : []),
                    {
                        key: 'detail',
                        name: 'detail',
                        params: { action: 'remove' },
                    },
                ],
                index: hasIndex ? 1 : 0,
            };
            const calls = [];
            openDrawerRoot(
                {
                    dispatch(action) {
                        assert.equal(action.target, stack.key);
                        stack = router.getStateForAction(
                            stack,
                            action,
                            options,
                        );
                    },
                    navigate(...args) {
                        calls.push(args);
                    },
                    closeDrawer() {
                        calls.push('close');
                    },
                },
                { routes: [{ name: routeName, state: stack }] },
                routeName,
            );
            assert.deepEqual(
                stack.routes.map((route) => route.name),
                ['index'],
            );
            assert.equal(stack.index, 0);
            assert.equal(stack.routes[0].params?.action, undefined);
            assert.deepEqual(calls, [[routeName], 'close']);
        });
}
test('a drawer stack that has not mounted starts at its index', () => {
    const calls = [];
    openDrawerRoot(
        {
            navigate: (...args) => calls.push(args),
            closeDrawer: () => calls.push('close'),
        },
        { routes: [{ name: 'edits' }] },
        'edits',
    );
    assert.deepEqual(calls, [['edits', { screen: 'index' }], 'close']);
});
