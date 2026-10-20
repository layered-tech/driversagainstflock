import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTourModule } from './tour-test-helpers.mjs';
import {
    CONE_VIEW_STYLES,
    coneImageExpression,
    coneImageName,
} from '../cone-view-styles.js';

const { ConeOfViewImage } = loadTourModule(
    new URL('../cone-of-view-image.js', import.meta.url),
    {
        'react-native-svg': {
            __esModule: true,
            default: 'Svg',
            Path: 'Path',
            Defs: 'Defs',
            Ellipse: 'Ellipse',
            LinearGradient: 'LinearGradient',
            Stop: 'Stop',
        },
    },
);

function nodes(tree) {
    if (!tree || typeof tree !== 'object') return [];
    return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}

test('all treatments retain the centered node anchor and image bounds at every cone size', () => {
    for (const length of [32, 64, 96, 192]) {
        const coneStyle = {
            length,
            angle: 40,
            color: '#FF4D4F',
            borderColor: '#E5383B',
            opacity: 0.32,
            imageName: `cone-${length}`,
        };
        for (const { value: variant } of CONE_VIEW_STYLES) {
            const tree = ConeOfViewImage({ coneStyle, variant });
            const size = length * 2 + 8;
            assert.equal(tree.props.width, size);
            assert.equal(tree.props.height, size);
            const paths = nodes(tree).filter(({ type }) => type === 'Path');
            assert.ok(paths[0].props.d.startsWith(`M ${size / 2} ${size / 2}`));
            for (const { props } of paths) {
                assert.doesNotMatch(props.d, /NaN|Infinity/);
                for (const coordinate of props.d
                    .match(/-?\d+(?:\.\d+)?/g)
                    .map(Number)) {
                    assert.ok(coordinate >= 0 && coordinate <= size);
                }
            }
            if (variant === 'flat') {
                assert.equal(paths[0].props.fillOpacity, 0.32);
                assert.equal(
                    nodes(tree).some(({ type }) => type === 'Defs'),
                    false,
                );
            } else {
                const gradient = nodes(tree).find(
                    ({ type }) => type === 'LinearGradient',
                );
                assert.equal(paths[0].props.fill, `url(#${gradient.props.id})`);
            }
        }
    }
});

test('zoom image selection uses distinct registered names while preserving current names', () => {
    const zoomStyles = [
        { minZoom: 0, imageName: 'cone0' },
        { minZoom: 17, imageName: 'cone17' },
        { minZoom: 19, imageName: 'cone19' },
    ];
    assert.equal(coneImageName('cone0'), 'cone0');
    assert.deepEqual(coneImageExpression(zoomStyles), [
        'step',
        ['zoom'],
        'cone0',
        17,
        'cone17',
        19,
        'cone19',
    ]);
    assert.deepEqual(coneImageExpression(zoomStyles, 'volume'), [
        'step',
        ['zoom'],
        'cone0-volume',
        17,
        'cone17-volume',
        19,
        'cone19-volume',
    ]);
    const names = CONE_VIEW_STYLES.flatMap(({ value }) =>
        zoomStyles.map(({ imageName }) => coneImageName(imageName, value)),
    );
    assert.equal(new Set(names).size, names.length);
});
