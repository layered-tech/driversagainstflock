import { StackActions } from '@react-navigation/routers';

export function openDrawerRoot(navigation, drawerState, routeName) {
    const stackKey = drawerState.routes.find(
        (route) => route.name === routeName,
    )?.state?.key;
    if (stackKey) {
        navigation.dispatch({
            ...StackActions.popTo('index'),
            target: stackKey,
        });
        navigation.navigate(routeName);
    } else {
        navigation.navigate(routeName, { screen: 'index' });
    }
    navigation.closeDrawer();
}
