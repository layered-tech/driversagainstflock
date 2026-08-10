export const faqItems = [
    {
        question: 'Is Drivers Against Flock really free?',
        answer: 'Yes — completely. No subscription, no paywall, no account to create, and no ads anywhere. The map and routing stay free for everyone. Running it does cost money, so if you want to chip in there’s a Buy Me a Coffee on our Contribute page, but it’s never required.',
    },
    {
        question: 'Where does the camera data come from?',
        answer: 'Every reader location is sourced from OpenStreetMap, the open, community-maintained map of the world. Contributors tag license-plate readers and roadside cameras they spot, and we sync those tags around the clock. It’s all public data — nothing scraped, nothing private.',
    },
    {
        question: 'Do you track me or store my trips?',
        answer: 'Your searches and routes are computed server-side, but nothing is stored or associated with your IP or device. We have nothing to sell or hand over because we never keep it in the first place.',
    },
    {
        question: 'What kinds of cameras does it show?',
        answer: 'Primarily automated license-plate readers (ALPRs) — the pole- and trailer-mounted units that photograph every passing plate — plus other fixed roadside surveillance cameras tagged in OpenStreetMap. We focus on the devices that quietly build a record of your movements.',
    },
    {
        question: 'Is it legal to use?',
        answer: 'Yes. You’re looking at public information about devices on public roads and choosing your own route, which you’re free to do. Drivers Against Flock doesn’t hide your plate or interfere with any camera — it just shows you where they are so you can decide how to drive.',
    },
    {
        question: 'A camera is missing or in the wrong spot — how do I fix it?',
        answer: 'Because the data lives in OpenStreetMap, anyone can correct it: add, move, or remove a reader directly in OSM and the change flows back to us on the next sync. We’re also building an in-app way to flag cameras you spot, so reporting gets even easier soon.',
    },
];

export const contributePage = {
    badgeLabels: ['Community-run', 'No ads, ever', 'Open data'],
    donationUrl: 'https://buymeacoffee.com/driversagainstflock',
    intro: 'Drivers Against Flock is community-run, ad-free, and stubbornly free to use. The bills are real, though — here’s how you can keep the map running.',
    label: 'Pitch in',
    summary: [
        {
            icon: 'layers',
            title: 'Servers & map tiles',
            body: 'Every map you pan loads tiles we pay for. Coffees keep them loading fast.',
        },
        {
            icon: 'map-pin',
            title: 'Fresh camera data',
            body: 'We sync new ALPR locations from OpenStreetMap around the clock.',
        },
        {
            icon: 'shield-check',
            title: 'No ads, no trackers',
            body: "We'll never sell your trips or run ads. Donations are what keep that promise.",
        },
    ],
    title: 'Help keep the creepy boxes on the map',
};
