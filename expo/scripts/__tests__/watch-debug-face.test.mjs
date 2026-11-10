import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const wear = new URL('../../../wear-os/', import.meta.url);
const module = new URL('complication-debug-face/', wear);
const rootPackage = JSON.parse(
    readFileSync(new URL('../package.json', wear), 'utf8'),
);
const parsed = spawnSync(
    'python3',
    [
        '-c',
        `
import json, pathlib, sys, xml.etree.ElementTree as ET
root = pathlib.Path(sys.argv[1])
def node(element):
    return dict(tag=element.tag, attrs=element.attrib, text=element.text or '', children=[node(e) for e in element])
result = {str(p.relative_to(root)): node(ET.parse(p).getroot()) for p in root.rglob('*.xml')}
app = root.parents[2] / 'app/src/main'
result['providerManifest'] = node(ET.parse(app / 'AndroidManifest.xml').getroot())
result['providerStrings'] = node(ET.parse(app / 'res/values/strings.xml').getroot())
print(json.dumps(result))
`,
        fileURLToPath(new URL('src/main/', module)),
    ],
    { encoding: 'utf8' },
);
assert.equal(parsed.status, 0, parsed.stderr);
const xml = JSON.parse(parsed.stdout);
const face = xml['res/raw/watchface.xml'];
const scene = face.children.find((node) => node.tag === 'Scene');
const slots = scene.children.filter((node) => node.tag === 'ComplicationSlot');
const types = [
    'SHORT_TEXT',
    'RANGED_VALUE',
    'LONG_TEXT',
    'MONOCHROMATIC_IMAGE',
];
const android = '{http://schemas.android.com/apk/res/android}';

function descendants(node, tag) {
    return node.children.flatMap((child) => [
        ...(child.tag === tag ? [child] : []),
        ...descendants(child, tag),
    ]);
}

test('root npm command installs only the debug watch face', () => {
    assert.equal(
        rootPackage.scripts['build:wear:debug-face'],
        './wear-os/gradlew -p wear-os :complication-debug-face:installDebug',
    );
});

test('all four provider formats have separate selectable slots', () => {
    assert.equal(slots.length, 4);
    assert.equal(new Set(slots.map((slot) => slot.attrs.slotId)).size, 4);
    for (const [index, slot] of slots.entries()) {
        const type = types[index];
        const service = [
            'WatchComplicationService',
            'WatchPrivacyScoreComplicationService',
            'WatchComplicationService',
            'WatchOpenCompanionComplicationService',
        ][index];
        assert.equal(slot.attrs.supportedTypes, `${type} EMPTY`);
        assert.deepEqual(
            slot.children
                .filter((node) => node.tag === 'Complication')
                .map((node) => node.attrs.type),
            [type, 'EMPTY'],
        );
        const policy = slot.children.find(
            (node) => node.tag === 'DefaultProviderPolicy',
        ).attrs;
        for (const [priority, packageName] of [
            ['primary', 'com.anonymous.drivefree'],
            ['secondary', 'com.anonymous.drivefree.dev'],
        ]) {
            assert.equal(
                policy[`${priority}Provider`],
                `${packageName}/org.driversagainstflock.watch.${service}`,
            );
            assert.equal(policy[`${priority}ProviderType`], type);
        }
        assert.equal(policy.defaultSystemProvider, 'EMPTY');
    }
});

test('picker entries advertise their content with matching supported formats', () => {
    const strings = Object.fromEntries(
        xml.providerStrings.children.map((node) => [
            node.attrs.name,
            node.text,
        ]),
    );
    const providers = descendants(xml.providerManifest, 'service').filter(
        (node) =>
            descendants(node, 'action').some(
                (action) =>
                    action.attrs[`${android}name`] ===
                    'android.support.wearable.complications.ACTION_COMPLICATION_UPDATE_REQUEST',
            ),
    );
    assert.equal(providers.length, 3);
    const expected = {
        '.WatchComplicationService': ['Area changes', 'SHORT_TEXT,LONG_TEXT'],
        '.WatchPrivacyScoreComplicationService': [
            'Privacy score',
            'RANGED_VALUE,SHORT_TEXT',
        ],
        '.WatchOpenCompanionComplicationService': ['Open companion', 'ICON'],
    };
    for (const provider of providers) {
        const [label, types] = expected[provider.attrs[`${android}name`]];
        assert.equal(
            strings[provider.attrs[`${android}label`].replace('@string/', '')],
            label,
        );
        assert.equal(
            provider.attrs[`${android}permission`],
            'com.google.android.wearable.permission.BIND_COMPLICATION_PROVIDER',
        );
        assert.equal(
            descendants(provider, 'meta-data').find((node) =>
                node.attrs[`${android}name`].endsWith('.SUPPORTED_TYPES'),
            ).attrs[`${android}value`],
            types,
        );
    }
});

test('gauge renders the supplied numeric value without relying on optional text', () => {
    const gauge = slots.find((slot) =>
        slot.attrs.supportedTypes.startsWith('RANGED_VALUE'),
    );
    const expressions = descendants(gauge, 'Parameter').map(
        (node) => node.attrs.expression,
    );
    assert.deepEqual(expressions, ['[COMPLICATION.RANGED_VALUE_VALUE]']);
    const transform = descendants(gauge, 'Transform').find(
        (node) => node.attrs.target === 'endAngle',
    ).attrs.value;
    for (const field of ['MIN', 'MAX', 'VALUE']) {
        assert.ok(transform.includes(`[COMPLICATION.RANGED_VALUE_${field}]`));
    }
    assert.ok(transform.includes('clamp('));
});

test('gauge expressions use supported functions and show empty, half, and full progress', () => {
    const gauge = slots.find((slot) =>
        slot.attrs.supportedTypes.startsWith('RANGED_VALUE'),
    );
    const range = gauge.children.find(
        (node) =>
            node.tag === 'Complication' && node.attrs.type === 'RANGED_VALUE',
    );
    const foreground = descendants(range, 'PartDraw').find((node) =>
        descendants(node, 'Stroke').some(
            (stroke) => stroke.attrs.color === '#1FBF6B',
        ),
    );
    const arc = descendants(foreground, 'Arc')[0];
    const angle = descendants(arc, 'Transform').find(
        (node) => node.attrs.target === 'endAngle',
    ).attrs.value;
    const alpha = descendants(foreground, 'Transform').find(
        (node) => node.attrs.target === 'alpha',
    ).attrs.value;
    function evaluate(expression, value, min = 0, max = 100) {
        const functions = [...expression.matchAll(/([a-zA-Z]+)\s*\(/g)].map(
            (match) => match[1],
        );
        assert.ok(
            functions.every((name) => name === 'clamp'),
            `Unsupported WFF function in ${expression}`,
        );
        const substituted = expression.replace(
            /\[COMPLICATION.RANGED_VALUE_(VALUE|MIN|MAX)\]/g,
            (_, field) => ({ VALUE: value, MIN: min, MAX: max })[field],
        );
        return new Function('clamp', `return (${substituted});`)(
            (number, low, high) => Math.min(high, Math.max(low, number)),
        );
    }
    const start = Number(arc.attrs.startAngle);
    for (const [value, expectedSweep, expectedAlpha] of [
        [0, 0, 0],
        [50, 150, 255],
        [100, 300, 255],
    ]) {
        assert.equal(evaluate(angle, value) - start, expectedSweep);
        assert.equal(evaluate(alpha, value), expectedAlpha);
    }
    assert.equal(evaluate(angle, 0, 0, 0) - start, 0);
    assert.equal(evaluate(alpha, 0, 0, 0), 0);
});

test('slot touch regions fit the round screen and do not overlap', () => {
    const radius = Number(face.attrs.width) / 2;
    const rectangles = slots.map(({ attrs }) =>
        Object.fromEntries(
            ['x', 'y', 'width', 'height'].map((key) => [
                key,
                Number(attrs[key]),
            ]),
        ),
    );
    for (const [index, rect] of rectangles.entries()) {
        assert.ok(rect.width >= 44 && rect.height >= 44);
        for (const x of [rect.x, rect.x + rect.width]) {
            for (const y of [rect.y, rect.y + rect.height]) {
                assert.ok(
                    Math.hypot(x - radius, y - radius) <= radius,
                    `Slot ${index + 1} clips the round screen`,
                );
            }
        }
        for (const other of rectangles.slice(index + 1)) {
            assert.ok(
                rect.x + rect.width <= other.x ||
                    other.x + other.width <= rect.x ||
                    rect.y + rect.height <= other.y ||
                    other.y + other.height <= rect.y,
            );
        }
    }
});

test('face is editable and packaged separately without code or release variants', () => {
    const app = xml['AndroidManifest.xml'].children.find(
        (node) => node.tag === 'application',
    );
    assert.equal(app.attrs[`${android}hasCode`], 'false');
    assert.ok(
        app.children.some(
            (node) =>
                node.attrs[`${android}name`] ===
                    'com.google.wear.watchface.format.version' &&
                node.attrs[`${android}value`] === '1',
        ),
    );
    assert.ok(
        xml['res/xml/watch_face_info.xml'].children.some(
            (node) => node.tag === 'Editable' && node.attrs.value === 'true',
        ),
    );
    const gradle = readFileSync(new URL('build.gradle.kts', module), 'utf8');
    assert.ok(
        gradle.includes(
            'applicationId = "org.driversagainstflock.watch.debugface"',
        ),
    );
    assert.ok(
        gradle.includes(
            'beforeVariants(selector().withBuildType("release")) { it.enable = false }',
        ),
    );
    assert.ok(
        readFileSync(new URL('settings.gradle.kts', wear), 'utf8').includes(
            'include(":complication-debug-face")',
        ),
    );
});
