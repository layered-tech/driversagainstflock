export function flagRelatedNodeId(flag, nodeId) {
    if (flag.evidence?.radius_meters == null || !flag.related_node_id)
        return null;
    if (Number(nodeId) === Number(flag.node_id)) return flag.related_node_id;
    if (Number(nodeId) === Number(flag.related_node_id)) return flag.node_id;
    return null;
}

export function flagMapNodes(node, flags = []) {
    const nodes = new Map([[Number(node.id), node]]);
    for (const flag of flags) {
        const id = flagRelatedNodeId(flag, node.id);
        if (id == null || nodes.has(Number(id))) continue;
        const location = flag.evidence?.locations?.[id];
        if (
            !Array.isArray(location) ||
            location.length !== 2 ||
            !location.every((value) => Number.isFinite(value)) ||
            Math.abs(location[0]) > 180 ||
            Math.abs(location[1]) > 90
        )
            continue;
        nodes.set(Number(id), {
            id: Number(id),
            longitude: location[0],
            latitude: location[1],
            osm_version: flag.evidence.node_versions?.[id],
            map_label: `Node ${id} (${Number(id) === Number(flag.node_id) ? 'duplicate' : 'original primary'})`,
        });
    }
    if (nodes.size > 1) {
        const isDuplicate = flags.some(
            (flag) =>
                flagRelatedNodeId(flag, node.id) != null &&
                Number(node.id) === Number(flag.node_id),
        );
        nodes.set(Number(node.id), {
            ...node,
            map_label: `Node ${node.id} (${isDuplicate ? 'duplicate' : 'original primary'})`,
        });
    }
    return [...nodes.values()];
}

export function flagSummary(flag, nodeId) {
    const evidence = flag.evidence || {};
    if (flag.source === 'alpr_presence') {
        const count = evidence.report_count;
        return count == null
            ? 'Not there report count unavailable'
            : `${count} Not there ${Number(count) === 1 ? 'report' : 'reports'}`;
    }
    if (evidence.missing_tags?.length) {
        return `Missing tags: ${evidence.missing_tags.join(', ')}`;
    }
    if (evidence.tag) {
        return `Invalid ${evidence.tag}: ${evidence.value === '' ? '(blank)' : (evidence.value ?? 'unavailable')}`;
    }
    if (evidence.maximum_meters != null) {
        return evidence.distance_meters == null
            ? `No matching road found within ${evidence.maximum_meters} m`
            : `Nearest matching road is ${evidence.distance_meters} m away (maximum ${evidence.maximum_meters} m)`;
    }
    if (evidence.radius_meters != null && flag.related_node_id) {
        const other = flagRelatedNodeId(flag, nodeId);
        const role =
            Number(other) === Number(flag.related_node_id)
                ? 'Original primary node'
                : 'Duplicate node';
        return `${role} ${other} is ${evidence.distance_meters ?? 'an unknown distance'} m away (within ${evidence.radius_meters} m)`;
    }
    return 'Rule evidence unavailable';
}

export function flagTiming(flag) {
    return flag.source === 'alpr_presence'
        ? {
              label: 'Latest report',
              at: flag.evidence?.latest_report_at ?? null,
          }
        : { label: 'Last checked', at: flag.evaluated_at ?? null };
}

export function flagFacts(flag) {
    const evidence = flag.evidence || {};
    const time = (label, value) => ({
        label,
        value: value ?? null,
        time: true,
    });
    const facts =
        flag.source === 'alpr_presence'
            ? [
                  {
                      label: 'Reports',
                      value:
                          evidence.report_count == null
                              ? 'Unavailable'
                              : String(evidence.report_count),
                  },
                  time('First reported', evidence.first_report_at),
                  time('Latest reported', evidence.latest_report_at),
                  time('Latest received', evidence.latest_received_at),
              ]
            : [
                  time('First flagged', flag.created_at),
                  time('Last checked', flag.evaluated_at),
                  { label: 'Repeat occurrences', value: 'Not recorded' },
              ];
    if (evidence.expected) {
        const expected = evidence.expected;
        const values = [
            expected.allowed_values?.length
                ? `Allowed: ${expected.allowed_values.join(', ')}`
                : null,
            expected.min != null ? `Minimum: ${expected.min}` : null,
            expected.max != null ? `Maximum: ${expected.max}` : null,
            expected.format ? `Format: ${expected.format}` : null,
        ].filter(Boolean);
        if (values.length)
            facts.push({ label: 'Expected value', value: values.join(' · ') });
    }
    if (Object.keys(evidence.matching_tags || {}).length) {
        facts.push({
            label: 'Matching tags',
            value: Object.entries(evidence.matching_tags)
                .map(([key, value]) => `${key}: ${value}`)
                .join(' · '),
        });
    }
    if (flag.status === 'dismissed')
        facts.push(time('Dismissed', flag.dismissed_at));
    return facts;
}
