export function escapeXML(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function buildTagElements(tags) {
    return Object.entries(tags ?? {})
        .filter(
            ([, value]) =>
                value !== null && value !== undefined && String(value) !== '',
        )
        .map(
            ([key, value]) =>
                `<tag k="${escapeXML(key)}" v="${escapeXML(value)}"/>`,
        )
        .join('');
}

export function buildChangesetCreateXML(tags) {
    return `<osm><changeset>${buildTagElements(tags)}</changeset></osm>`;
}

export function buildOsmChangeCreateXML({ changesetId, generator, nodes }) {
    const nodeElements = (nodes ?? [])
        .map((node, index) => {
            const latitude = Number(node.latitude).toFixed(7);
            const longitude = Number(node.longitude).toFixed(7);
            const openingTag = `<node id="${-(index + 1)}" changeset="${escapeXML(changesetId)}" lat="${latitude}" lon="${longitude}">`;

            return `${openingTag}${buildTagElements(node.tags)}</node>`;
        })
        .join('');

    return `<osmChange version="0.6" generator="${escapeXML(generator)}"><create>${nodeElements}</create></osmChange>`;
}

export function parseChangesetCreateResponse(text) {
    const changesetId = parseInt(String(text ?? '').trim(), 10);

    if (Number.isNaN(changesetId)) {
        throw new Error(
            'OpenStreetMap returned an unexpected changeset response.',
        );
    }

    return changesetId;
}

function getNumberAttribute(element, attributeName) {
    const match = element.match(new RegExp(`\\b${attributeName}="(-?\\d+)"`));

    return match ? parseInt(match[1], 10) : null;
}

export function parseDiffResult(xmlText) {
    const nodeElements = String(xmlText ?? '').match(/<node\b[^>]*\/?>/g) ?? [];

    return nodeElements.map((element) => ({
        newId: getNumberAttribute(element, 'new_id'),
        newVersion: getNumberAttribute(element, 'new_version'),
        oldId: getNumberAttribute(element, 'old_id'),
    }));
}
