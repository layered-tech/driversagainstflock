export const PRIMARY_DRAWER_ITEMS = [
    { icon: 'map', label: 'Map', routeName: 'index' },
    { icon: 'gauge', label: 'Scorecard', routeName: 'scorecard' },
    { icon: 'flame', label: 'Hotlist', routeName: 'hotlist' },
];

export const HELP_AND_LEGAL_DRAWER_ITEMS = [
    { icon: 'circle-help', label: 'FAQ', routeName: 'faqs' },
    { icon: 'coffee', label: 'Support Us', routeName: 'contribute-to-daf' },
    { icon: 'info', label: 'About & Legal', routeName: 'about-and-legal' },
];

export function getDrawerActiveRouteName(state) {
    return state?.routes?.[state.index]?.name;
}
