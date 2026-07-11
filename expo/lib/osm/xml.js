export function escapeXML(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function unescapeXML(value) {
    return String(value)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
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

export function buildOsmChangeModifyXML({ changesetId, generator, node }) {
    const latitude = Number(node.latitude).toFixed(7);
    const longitude = Number(node.longitude).toFixed(7);
    const openingTag = `<node id="${escapeXML(node.id)}" changeset="${escapeXML(changesetId)}" version="${escapeXML(node.version)}" lat="${latitude}" lon="${longitude}">`;

    return `<osmChange version="0.6" generator="${escapeXML(generator)}"><modify>${openingTag}${buildTagElements(node.tags)}</node></modify></osmChange>`;
}

export function buildOsmChangeDeleteXML({ changesetId, generator, node }) {
    const latitude = Number(node.latitude).toFixed(7);
    const longitude = Number(node.longitude).toFixed(7);
    const nodeElement = `<node id="${escapeXML(node.id)}" changeset="${escapeXML(changesetId)}" version="${escapeXML(node.version)}" lat="${latitude}" lon="${longitude}"/>`;

    return `<osmChange version="0.6" generator="${escapeXML(generator)}"><delete>${nodeElement}</delete></osmChange>`;
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

function getFloatAttribute(element, attributeName) {
    const match = element.match(
        new RegExp(`\\b${attributeName}="(-?\\d+(?:\\.\\d+)?)"`),
    );

    return match ? parseFloat(match[1]) : null;
}

function getStringAttribute(element, attributeName) {
    const match = element.match(new RegExp(`\\b${attributeName}="([^"]*)"`));

    return match ? unescapeXML(match[1]) : null;
}

// Matches self-closing node elements before paired ones so a lazy
// `</node>` search can never swallow a following sibling element.
const OSM_CHANGE_NODE_PATTERN =
    /<node\b[^>]*\/>|<node\b[^>]*>[\s\S]*?<\/node>/g;

function parseOsmChangeNodeElement(element) {
    const openingTag = element.match(/<node\b[^>]*>/)?.[0] ?? element;
    const tags = {};

    for (const tagElement of element.match(/<tag\b[^>]*\/?>/g) ?? []) {
        const key = getStringAttribute(tagElement, 'k');
        const value = getStringAttribute(tagElement, 'v');

        if (key !== null && value !== null) {
            tags[key] = value;
        }
    }

    return {
        id: getNumberAttribute(openingTag, 'id'),
        latitude: getFloatAttribute(openingTag, 'lat'),
        longitude: getFloatAttribute(openingTag, 'lon'),
        tags,
        version: getNumberAttribute(openingTag, 'version'),
    };
}

function parseOsmChangeActionNodes(xmlText, action) {
    const blockPattern = new RegExp(
        `<${action}\\b[^>]*>([\\s\\S]*?)</${action}>`,
        'g',
    );
    const nodes = [];

    for (const blockMatch of String(xmlText ?? '').matchAll(blockPattern)) {
        const nodeElements = blockMatch[1].match(OSM_CHANGE_NODE_PATTERN) ?? [];

        for (const nodeElement of nodeElements) {
            nodes.push(parseOsmChangeNodeElement(nodeElement));
        }
    }

    return nodes;
}

export function parseOsmChangeXML(xmlText) {
    return {
        created: parseOsmChangeActionNodes(xmlText, 'create'),
        deleted: parseOsmChangeActionNodes(xmlText, 'delete'),
        modified: parseOsmChangeActionNodes(xmlText, 'modify'),
    };
}
