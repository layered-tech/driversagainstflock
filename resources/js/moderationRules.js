export const ruleTypes = [
    {
        value: 'duplicate_nodes',
        name: 'Duplicate node',
        description:
            'Another surveillance node too close, carrying the same tags.',
    },
    {
        value: 'missing_tags',
        name: 'Missing tags',
        description: 'Tags every surveillance node must carry.',
    },
    {
        value: 'road_distance',
        name: 'Too far from road',
        description:
            'A node farther from any mapped road than a camera could be.',
    },
    {
        value: 'invalid_tag',
        name: 'Invalid tags',
        description: 'A tag whose value is outside what we accept.',
    },
];

export const roadClasses = [
    'motorway',
    'trunk',
    'primary',
    'secondary',
    'tertiary',
    'unclassified',
    'residential',
    'service',
];

export function ruleDefaults(type) {
    return {
        duplicate_nodes: {
            settings: {
                distance_meters: 10,
                match_tags: ['man_made', 'surveillance:type'],
            },
            conditions: [
                { key: 'man_made', operator: 'equals', value: 'surveillance' },
                { key: 'surveillance:type', operator: 'equals', value: 'ALPR' },
            ],
        },
        missing_tags: {
            settings: { keys: [], blank_is_missing: true },
            conditions: [],
        },
        road_distance: {
            settings: {
                distance_meters: 40,
                road_types: roadClasses.slice(0, 7),
            },
            conditions: [],
        },
        invalid_tag: {
            settings: {
                key: '',
                allowed_values: [],
                min: null,
                max: null,
                format: null,
            },
            conditions: [],
        },
    }[type];
}

export function ruleLines(text) {
    return [
        ...new Set(
            text
                .split('\n')
                .map((value) => value.trim())
                .filter(Boolean),
        ),
    ];
}

export function ruleFormValues(rule) {
    return rule
        ? {
              name: rule.name,
              description: rule.description || '',
              type: rule.type,
              severity: rule.severity,
              enabled: rule.enabled,
              version: rule.version,
              settings: JSON.parse(JSON.stringify(rule.settings)),
              conditions: JSON.parse(JSON.stringify(rule.conditions)),
              exceptions: JSON.parse(JSON.stringify(rule.exceptions)),
              area_ids: [...rule.area_ids],
          }
        : {
              name: '',
              description: '',
              type: 'duplicate_nodes',
              severity: 'Medium',
              enabled: true,
              version: 1,
              ...ruleDefaults('duplicate_nodes'),
              exceptions: [],
              area_ids: [],
          };
}

export function duplicateTagText(rule) {
    return (rule.settings.match_tags || [])
        .map((key) => {
            const condition = rule.conditions.find(
                (condition) =>
                    condition.key === key && condition.operator === 'equals',
            );
            return condition ? `${key}=${condition.value}` : key;
        })
        .join('\n');
}

export function duplicateTagConfiguration(text, rule) {
    const tags = ruleLines(text).map((tag) => {
        const equal = tag.indexOf('=');
        return equal < 0
            ? { key: tag }
            : {
                  key: tag.slice(0, equal).trim(),
                  value: tag.slice(equal + 1).trim(),
              };
    });
    return {
        match_tags: [...new Set(tags.map((tag) => tag.key))],
        conditions: [
            ...rule.conditions.filter(
                (condition) =>
                    !(
                        rule.settings.match_tags.includes(condition.key) &&
                        condition.operator === 'equals'
                    ),
            ),
            ...tags
                .filter((tag) => tag.value !== undefined)
                .map((tag) => ({
                    key: tag.key,
                    operator: 'equals',
                    value: tag.value,
                })),
        ],
    };
}

const joinOr = (values) =>
    values.length <= 1
        ? values.join('')
        : `${values.slice(0, -1).join(', ')} or ${values.at(-1)}`;
const valueOrPlaceholder = (value) =>
    value === '' || value == null ? '…' : value;
export function ruleSummary(rule) {
    const settings = rule.settings;
    if (rule.type === 'duplicate_nodes') {
        const count = settings.match_tags.length;
        return count
            ? `Another node sharing the same ${count} tag${count === 1 ? '' : 's'} sits within ${valueOrPlaceholder(settings.distance_meters)} m.`
            : `Another ALPR node sits within ${valueOrPlaceholder(settings.distance_meters)} m.`;
    }
    if (rule.type === 'missing_tags') {
        const conditions = rule.conditions
            .filter((condition) => condition.operator === 'equals')
            .map((condition) => `${condition.key}=${condition.value}`);
        return `${joinOr(settings.keys) || '…'} is missing on nodes tagged ${conditions.join(', ') || 'surveillance:type=ALPR'}.`;
    }
    if (rule.type === 'road_distance') {
        return `Sits more than ${valueOrPlaceholder(settings.distance_meters)} m from the nearest mapped road (${settings.road_types.join(', ') || '…'}).`;
    }
    const parts = [];
    if (settings.allowed_values?.length)
        parts.push(`one of ${joinOr(settings.allowed_values)}`);
    if (settings.min != null || settings.max != null)
        parts.push(
            `from ${valueOrPlaceholder(settings.min)} to ${valueOrPlaceholder(settings.max)}`,
        );
    const formats = {
        integer: 'a whole number',
        decimal: 'a number',
        direction: 'a compass direction or a bearing from 0 to 360',
        url: 'an HTTP or HTTPS URL',
    };
    if (settings.format) parts.push(formats[settings.format]);
    return `${settings.key || '…'} must be ${parts.join(' and ') || '…'}.`;
}

export function validRule(rule, mode = null) {
    if (!rule.name.trim()) return false;
    const settings = rule.settings;
    if (rule.type === 'missing_tags')
        return (
            settings.keys.length > 0 &&
            settings.keys.every((key) => key.length > 0)
        );
    if (['road_distance', 'duplicate_nodes'].includes(rule.type)) {
        if (!(
            Number(settings.distance_meters) > 0 &&
            Number(settings.distance_meters) <= 5000
        ))
            return false;
        return rule.type !== 'road_distance' || settings.road_types.length > 0;
    }
    const min = settings.min === '' ? null : settings.min;
    const max = settings.max === '' ? null : settings.max;
    if (mode === 'range' && min == null && max == null) return false;
    return (
        Boolean(settings.key?.trim()) &&
        (settings.allowed_values?.length > 0 ||
            settings.format ||
            min != null ||
            max != null) &&
        !(min != null && max != null && Number(max) < Number(min))
    );
}

export function ruleGroups(rules, filters) {
    const ranks = { High: 3, Medium: 2, Low: 1 };
    return ruleTypes
        .map((type) => ({
            ...type,
            rows: rules
                .filter(
                    (rule) =>
                        rule.type === type.value &&
                        (!filters.types?.length ||
                            filters.types.includes(rule.type)) &&
                        (!filters.severities?.length ||
                            filters.severities.includes(rule.severity)) &&
                        (!filters.states?.length ||
                            filters.states.includes(
                                rule.enabled ? 'Enabled' : 'Paused',
                            )),
                )
                .sort(
                    (left, right) =>
                        ranks[right.severity] - ranks[left.severity] ||
                        left.name.localeCompare(right.name),
                ),
        }))
        .filter((group) => group.rows.length);
}
