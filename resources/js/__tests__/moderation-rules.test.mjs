import { useForm } from '@inertiajs/vue3';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    duplicateTagConfiguration,
    duplicateTagText,
    ruleDefaults,
    ruleFormValues,
    ruleGroups,
    ruleLines,
    ruleSummary,
    validRule,
} from '../moderationRules.js';

const rule = (type, values = {}) => ({
    name: 'A rule',
    type,
    severity: 'Medium',
    enabled: true,
    area_ids: [],
    exceptions: [],
    ...ruleDefaults(type),
    ...values,
});

test('rules combine type severity and status filters and sort groups by severity', () => {
    const rules = [
        rule('missing_tags', { name: 'Z', severity: 'Low' }),
        rule('missing_tags', { name: 'B', severity: 'High' }),
        rule('missing_tags', { name: 'A', severity: 'High', enabled: false }),
        rule('duplicate_nodes', { name: 'D', severity: 'High' }),
    ];
    const groups = ruleGroups(rules, {});
    assert.deepEqual(
        groups.map((group) => group.value),
        ['duplicate_nodes', 'missing_tags'],
    );
    assert.deepEqual(
        groups[1].rows.map((row) => row.name),
        ['A', 'B', 'Z'],
    );
    assert.deepEqual(
        ruleGroups(rules, {
            types: ['missing_tags'],
            severities: ['High'],
            states: ['Enabled'],
        })[0].rows.map((row) => row.name),
        ['B'],
    );
    assert.deepEqual(ruleGroups(rules, { types: ['road_distance'] }), []);
});

test('duplicate tag values become eligibility conditions while matching preserves unrelated constraints', () => {
    const original = rule('duplicate_nodes', {
        settings: { distance_meters: 10, match_tags: ['operator'] },
        conditions: [
            { key: 'operator', operator: 'equals', value: 'Old name' },
            { key: 'camera:type', operator: 'equals', value: 'fixed' },
        ],
    });
    const next = duplicateTagConfiguration(
        'operator=City=Department\n man_made=surveillance\noperator=City=Department\n camera:mount',
        original,
    );
    assert.deepEqual(next.match_tags, ['operator', 'man_made', 'camera:mount']);
    assert.deepEqual(next.conditions, [
        { key: 'camera:type', operator: 'equals', value: 'fixed' },
        { key: 'operator', operator: 'equals', value: 'City=Department' },
        { key: 'man_made', operator: 'equals', value: 'surveillance' },
    ]);
    assert.equal(
        duplicateTagText({
            settings: { match_tags: next.match_tags },
            conditions: next.conditions,
        }),
        'operator=City=Department\nman_made=surveillance\ncamera:mount',
    );
    assert.equal(original.conditions[0].value, 'Old name');
});

test('rule summaries describe configured constraints without inventing findings', () => {
    assert.match(
        ruleSummary(
            rule('duplicate_nodes', {
                settings: { distance_meters: 12.5, match_tags: [] },
            }),
        ),
        /Another ALPR node sits within 12.5 m/,
    );
    assert.match(
        ruleSummary(
            rule('missing_tags', {
                settings: { keys: ['operator', 'direction'] },
                conditions: [
                    { key: 'camera:type', operator: 'equals', value: 'fixed' },
                ],
            }),
        ),
        /operator or direction is missing on nodes tagged camera:type=fixed/,
    );
    assert.match(
        ruleSummary(
            rule('invalid_tag', {
                settings: {
                    key: 'direction',
                    allowed_values: [],
                    min: 0,
                    max: 359,
                    format: 'integer',
                },
            }),
        ),
        /direction must be from 0 to 359 and a whole number/,
    );
    assert.match(
        ruleSummary(
            rule('invalid_tag', {
                settings: {
                    key: 'direction',
                    allowed_values: [],
                    format: 'direction',
                },
            }),
        ),
        /compass direction or a bearing from 0 to 360/,
    );
    assert.match(
        ruleSummary(
            rule('road_distance', {
                settings: {
                    distance_meters: 40,
                    road_types: ['service', 'residential'],
                },
            }),
        ),
        /service, residential/,
    );
});

test('rule validity handles unfinished names conditions and limits', () => {
    assert.equal(validRule(rule('duplicate_nodes')), true);
    assert.equal(validRule(rule('duplicate_nodes', { name: ' ' })), false);
    assert.equal(validRule(rule('missing_tags')), false);
    assert.equal(
        validRule(rule('missing_tags', { settings: { keys: ['operator'] } })),
        true,
    );
    assert.equal(
        validRule(
            rule('road_distance', {
                settings: { distance_meters: 0, road_types: ['primary'] },
            }),
        ),
        false,
    );
    assert.equal(
        validRule(
            rule('road_distance', {
                settings: { distance_meters: 5001, road_types: ['primary'] },
            }),
        ),
        false,
    );
    assert.equal(
        validRule(
            rule('road_distance', {
                settings: { distance_meters: 40, road_types: [] },
            }),
        ),
        false,
    );
    assert.equal(validRule(rule('invalid_tag')), false);
    assert.equal(
        validRule(
            rule('invalid_tag', {
                settings: {
                    key: 'direction',
                    min: 5,
                    max: 4,
                    format: 'integer',
                },
            }),
        ),
        false,
    );
    assert.equal(
        validRule(
            rule('invalid_tag', {
                settings: {
                    key: 'direction',
                    min: 0,
                    max: 359,
                    format: 'integer',
                },
            }),
        ),
        true,
    );
    assert.deepEqual(ruleLines('operator\n direction\noperator\n\n'), [
        'operator',
        'direction',
    ]);
});

test('new rule forms retain their version in later edit requests and isolate drafts from saved configuration', () => {
    const form = useForm(ruleFormValues(null));
    assert.equal(form.data().enabled, true);
    assert.equal(form.data().version, 1);
    form.version = 7;
    form.defaults(form.data());
    assert.equal(form.data().version, 7);
    const saved = rule('duplicate_nodes', { version: 3 });
    const editing = ruleFormValues(saved);
    editing.settings.match_tags.push('operator');
    assert.equal(editing.version, 3);
    assert.deepEqual(saved.settings.match_tags, [
        'man_made',
        'surveillance:type',
    ]);
});

test('range mode needs a boundary while format checks preserve existing open ranges', () => {
    const draft = rule('invalid_tag', {
        settings: { key: 'direction', min: '', max: '', format: 'integer' },
    });
    assert.equal(validRule(draft, 'range'), false);
    assert.equal(validRule(draft, 'format'), true);
    draft.settings.min = 0;
    assert.equal(validRule(draft, 'range'), true);
    draft.settings.max = -1;
    assert.equal(validRule(draft, 'range'), false);
});
