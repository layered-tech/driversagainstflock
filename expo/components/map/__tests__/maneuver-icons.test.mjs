import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { getManeuverExitNumber, getManeuverKind } from '../maneuver-kind.js';
import { maneuverIcons } from '../maneuver-icons.generated.js';
import { semanticWatchManeuver } from '../../watch/watch-contract.js';

const expected = [
    'left',
    'right',
    'sharp-left',
    'sharp-right',
    'slight-left',
    'slight-right',
    'straight',
    'roundabout',
    'roundabout',
    'uturn',
    'arrive',
    'depart',
    'keep-left',
    'keep-right',
];

test('phone and watch select the same precise maneuver for every provider type', () => {
    expected.forEach((kind, type) => {
        const maneuver = {
            type,
            stepIndex: 4,
            instruction: 'Turn right',
            exit_number: 12,
            distanceToManeuver: 30,
        };
        assert.equal(getManeuverKind(maneuver), kind);
        assert.ok(maneuverIcons[kind]);
        assert.deepEqual(semanticWatchManeuver(maneuver, 8), {
            id: '8:4',
            kind,
            instruction: 'Turn right',
            distanceMeters: 30,
            exitNumber: 12,
        });
    });
    assert.equal(
        new Set(
            ['left', 'sharp-left', 'slight-left', 'keep-left', 'uturn'].map(
                (kind) => maneuverIcons[kind].paths[0].d,
            ),
        ).size,
        5,
    );
});

test('unknown types never guess a turn from instruction text', () => {
    for (const type of [
        undefined,
        null,
        '',
        '0',
        -1,
        14,
        98,
        1.5,
        NaN,
        Infinity,
    ]) {
        assert.equal(getManeuverKind({ type, instruction: 'Turn left' }), null);
        assert.equal(semanticWatchManeuver({ type }, 1), null);
    }
});

test('only roundabouts have positive integer exit badges', () => {
    for (const exit of [undefined, null, 0, -1, 1.5, '3', NaN]) {
        assert.equal(getManeuverExitNumber('roundabout', exit), null);
    }
    for (const exit of [1, 9, 10, 19]) {
        assert.equal(getManeuverExitNumber('roundabout', exit), exit);
        assert.equal(getManeuverExitNumber('left', exit), null);
    }
});

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
const element = (type, props) => ({ type, props });
const module = { exports: {} };
const code = transformSync(
    readFileSync(new URL('../maneuver-icon.js', import.meta.url), 'utf8'),
    {
        babelrc: false,
        configFile: false,
        plugins: [
            [
                require('@babel/plugin-transform-react-jsx'),
                { runtime: 'automatic' },
            ],
            require('@babel/plugin-transform-modules-commonjs'),
        ],
    },
).code;
const kinds = await import('../maneuver-kind.js');
const mocks = {
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { View: 'View' },
    'react-native-svg': {
        __esModule: true,
        default: 'Svg',
        G: 'G',
        Path: 'Path',
        Text: 'SvgText',
    },
    './maneuver-icons.generated': { maneuverIcons },
    './maneuver-kind': kinds,
};
new Function('require', 'module', 'exports', code)(
    (name) => mocks[name],
    module,
    module.exports,
);
const render = module.exports.ManeuverIcon;

test('mobile roundabouts retain Mapbox arrows with the exit number centered inside the SVG', () => {
    for (const color of ['#FFFFFF', '#06281A', '#828D9B']) {
        for (const size of [16, 20, 30]) {
            for (const type of [7, 8]) {
                for (const exit of [1, 2, 10, 19]) {
                    const tree = render({
                        maneuver: { type, exit_number: exit },
                        color,
                        size,
                    });
                    assert.equal(
                        Array.isArray(tree.props.children),
                        false,
                        'no adjacent exit badge',
                    );
                    const svg = tree.props.children;
                    assert.equal(svg.type, 'Svg');
                    assert.equal(svg.props.width, size);
                    assert.equal(svg.props.height, size);
                    assert.equal(svg.props.viewBox, '0 0 20 20');
                    assert.equal(
                        svg.props.children[0][0].props.children.props.d,
                        maneuverIcons.roundabout.paths[0].d,
                    );
                    assert.equal(
                        svg.props.children[0][0].props.children.props.fill,
                        color,
                    );
                    assert.equal(
                        svg.props.children[0][0].props.transform,
                        'translate(-3 -3) scale(1.3)',
                    );
                    const number = svg.props.children[1];
                    assert.equal(number.props.fontSize, 6);
                    assert.equal(number.type, 'SvgText');
                    assert.equal(number.props.children, exit);
                    assert.equal(number.props.x, 10);
                    assert.equal(number.props.y, 10);
                    assert.equal(number.props.textAnchor, 'middle');
                    assert.equal(number.props.alignmentBaseline, 'central');
                    assert.equal(number.props.fill, color);
                    assert.equal(
                        tree.props.accessibilityLabel,
                        `Roundabout exit ${exit}`,
                    );
                }
            }
        }
    }
});

test('other maneuvers and roundabouts without an exit retain their source geometry', () => {
    for (const [type, kind] of expected.entries()) {
        const tree = render({ maneuver: { type }, color: 'white', size: 20 });
        const svg = tree.props.children;
        assert.equal(svg.props.width, 20);
        assert.equal(svg.props.viewBox, maneuverIcons[kind].viewBox.join(' '));
        assert.equal(
            svg.props.children[0][0].props.children.props.d,
            maneuverIcons[kind].paths[0].d,
        );
        assert.equal(
            svg.props.children[0][0].props.children.props.fill,
            'white',
        );
    }
    const unknown = render({ maneuver: { type: 98 }, color: 'white' });
    assert.equal(unknown.props.children.props.children[0], undefined);
    assert.equal(unknown.props.accessibilityLabel, 'Guidance updating');
});

test('exits beyond the numbered asset range still appear inside the SVG', () => {
    const tree = render({
        maneuver: { type: 7, exit_number: 20 },
        color: 'white',
    });
    const svg = tree.props.children;
    const number = svg.props.children[1];
    assert.equal(number.type, 'SvgText');
    assert.equal(number.props.children, 20);
    assert.equal(number.props.x, 10);
    assert.equal(number.props.y, 10);
    assert.equal(number.props.textAnchor, 'middle');
    assert.equal(tree.props.accessibilityLabel, 'Roundabout exit 20');
});

test('vendored SVGs match mobile and Android geometry and generated files are current', () => {
    const generator = new URL(
        '../../../scripts/generate-maneuver-icons.py',
        import.meta.url,
    );
    const result = spawnSync('python3', [generator.pathname, '--check'], {
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(
        readFileSync(
            new URL(
                '../../../assets/map/directions-icons/manifest.json',
                import.meta.url,
            ),
        ),
    );
    assert.match(manifest.revision, /^[a-f0-9]{40}$/);
    assert.deepEqual(
        Object.keys(maneuverIcons).sort(),
        [...new Set(expected)].sort(),
    );
    const inspect = `import json,sys,xml.etree.ElementTree as E
from pathlib import Path
root=Path(sys.argv[1]); ns='{http://schemas.android.com/apk/res/android}'
manifest=json.loads((root/'expo/assets/map/directions-icons/manifest.json').read_text())
result={}
for kind, source in manifest['icons'].items():
 s=E.parse(root/'expo/assets/map/directions-icons'/Path(source).name).getroot()
 v=E.parse(root/'wear-os/app/src/main/res/drawable'/('maneuver_'+kind.replace('-','_')+'.xml')).getroot()
 result[kind]={'viewBox':[float(n) for n in s.attrib['viewBox'].split()], 'source':[p.attrib['d'] for p in s.findall('{http://www.w3.org/2000/svg}path')], 'vector':[p.attrib[ns+'pathData'] for p in v.iter('path')], 'viewport':[float(v.attrib[ns+'viewportWidth']),float(v.attrib[ns+'viewportHeight'])]}
print(json.dumps(result))`;
    const parity = JSON.parse(
        execFileSync('python3', [
            '-c',
            inspect,
            new URL('../../../../', import.meta.url).pathname,
        ]),
    );
    for (const [kind, icon] of Object.entries(maneuverIcons)) {
        assert.deepEqual(icon.viewBox, parity[kind].viewBox);
        assert.deepEqual(icon.viewBox.slice(2), parity[kind].viewport);
        assert.deepEqual(
            icon.paths.map((p) => p.d),
            parity[kind].source,
        );
        assert.deepEqual(
            icon.paths.map((p) => p.d),
            parity[kind].vector,
        );
    }
});
