#!/usr/bin/env python3
"""Generate offline mobile geometry and Wear OS resources from pinned Mapbox SVGs."""
import argparse
import json
import math
import re
import subprocess
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'expo/assets/map/directions-icons'
MOBILE = ROOT / 'expo/components/map/maneuver-icons.generated.js'
DRAWABLES = ROOT / 'wear-os/app/src/main/res/drawable'
AUTOMOTIVE = ROOT / 'expo/assets/auto-play'
AUTOMOTIVE_IMAGES = ROOT / 'expo/components/auto-play-maneuver-images.generated.js'
ROUNDABOUT_IMAGES = ROOT / 'expo/components/auto-play-roundabout-exit-images.js'
SVG = '{http://www.w3.org/2000/svg}'


def attributes(element, allowed):
    unexpected = set(element.attrib) - set(allowed)
    if unexpected:
        raise ValueError(f'Unsupported SVG attributes: {sorted(unexpected)}')


def parse_svg(source):
    root = ET.fromstring(source)
    if root.tag != SVG + 'svg':
        raise ValueError('Expected SVG root')
    attributes(root, ['id', 'data-name', 'width', 'height', 'viewBox'])
    view_box = [float(value) for value in root.attrib['viewBox'].split()]
    if len(view_box) != 4 or not all(math.isfinite(value) for value in view_box) or view_box[:2] != [0, 0] or min(view_box[2:]) <= 0:
        raise ValueError('Expected a positive, zero-origin viewBox')
    paths = []
    for child in root:
        if child.tag == SVG + 'title' and not child.attrib and not list(child):
            continue
        if child.tag != SVG + 'path' or list(child):
            raise ValueError(f'Unsupported SVG element: {child.tag}')
        attributes(child, ['d', 'fill', 'fill-rule', 'transform'])
        fill = child.get('fill', '#000000')
        rule = child.get('fill-rule', 'nonzero')
        if fill not in ['#000000', '#000', 'black', 'none'] or rule not in ['nonzero', 'evenodd']:
            raise ValueError('Unsupported fill or fill rule')
        path = {'d': child.attrib['d'], 'fill': fill, 'fillRule': rule}
        transform = child.get('transform')
        if transform:
            # This subset is losslessly representable by both SVG and VectorDrawable.
            match = re.fullmatch(r'translate\(\s*([-+\d.eE]+)(?:[\s,]+([-+\d.eE]+))?\s*\)', transform)
            if not match:
                raise ValueError(f'Unsupported SVG transform: {transform}')
            path['translate'] = [float(match[1]), float(match[2] or 0)]
            if not all(math.isfinite(value) for value in path['translate']):
                raise ValueError('Expected finite SVG translation')
        paths.append(path)
    if not paths:
        raise ValueError('SVG contains no paths')
    return {'viewBox': view_box, 'paths': paths}


def vector(icon, roundabout=False):
    width, height = icon['viewBox'][2:]
    root = ET.Element('vector', {
        'xmlns:android': 'http://schemas.android.com/apk/res/android',
        'android:width': '56dp', 'android:height': '56dp',
        'android:viewportWidth': f'{width:g}', 'android:viewportHeight': f'{height:g}',
    })
    artwork = root
    if roundabout:
        artwork = ET.SubElement(root, 'group', {
            'android:pivotX': '10', 'android:pivotY': '10',
            'android:scaleX': '1.3', 'android:scaleY': '1.3',
        })
    for path in icon['paths']:
        parent = artwork
        if 'translate' in path:
            x, y = path['translate']
            parent = ET.SubElement(artwork, 'group', {'android:translateX': f'{x:g}', 'android:translateY': f'{y:g}'})
        ET.SubElement(parent, 'path', {
            'android:pathData': path['d'],
            'android:fillColor': '#00000000' if path['fill'] == 'none' else '#FF000000',
            'android:fillType': 'evenOdd' if path['fillRule'] == 'evenodd' else 'nonZero',
        })
    ET.indent(root, space='    ')
    return '<!-- Generated from pinned Mapbox SVGs; run expo/scripts/generate-maneuver-icons.py. -->\n' + ET.tostring(root, encoding='unicode') + '\n'


def automotive_svg(icon, roundabout=False):
    root = ET.Element('svg', {'xmlns': 'http://www.w3.org/2000/svg',
        'width': '512', 'height': '512', 'viewBox': ' '.join(f'{n:g}' for n in icon['viewBox'])})
    artwork = ET.SubElement(root, 'g', {'transform': 'translate(-3 -3) scale(1.3)'}) if roundabout else root
    for path in icon['paths']:
        attrs = {'d': path['d'], 'fill': 'none' if path['fill'] == 'none' else 'white', 'fill-rule': path['fillRule']}
        if 'translate' in path:
            attrs['transform'] = 'translate(' + ' '.join(f'{n:g}' for n in path['translate']) + ')'
        ET.SubElement(artwork, 'path', attrs)
    return ET.tostring(root, encoding='unicode')


def automotive_png(icon, roundabout=False, exit_number=None):
    command = ['magick', '-background', 'none', 'svg:-']
    if exit_number is not None:
        font_size = min(6, 12 / len(str(exit_number))) * 512 / 20
        command += ['-font', str(ROOT / 'expo/assets/fonts/JetBrainsMono-Bold.ttf'),
            '-pointsize', str(font_size), '-fill', 'white', '-gravity', 'center', '-annotate', '+0+0', str(exit_number)]
    command += ['-resize', '128x128', '-strip', 'PNG32:-']
    return subprocess.run(command, input=automotive_svg(icon, roundabout).encode(), check=True, capture_output=True).stdout


def automotive_outputs(icons):
    files = {}
    lines = ['// Generated by expo/scripts/generate-maneuver-icons.py. Do not edit.', 'export const automotiveManeuverImages = {']
    for kind, icon in icons.items():
        files[AUTOMOTIVE / 'maneuvers' / f'{kind}.png'] = automotive_png(icon, kind == 'roundabout')
        key = kind if kind.isidentifier() else repr(kind)
        lines.append(f"    {key}: require('../assets/auto-play/maneuvers/{kind}.png'),")
    files[AUTOMOTIVE_IMAGES] = '\n'.join(lines + ['};', ''])
    lines = ['// Generated by expo/scripts/generate-maneuver-icons.py. Do not edit.', 'const ROUNDABOUT_EXIT_IMAGES = {']
    for exit_number in range(1, 20):
        files[AUTOMOTIVE / 'roundabout-exits' / f'roundabout-exit-{exit_number}.png'] = automotive_png(icons['roundabout'], True, exit_number)
        lines.append(f"    {exit_number}: require('../assets/auto-play/roundabout-exits/roundabout-exit-{exit_number}.png'),")
    files[ROUNDABOUT_IMAGES] = '\n'.join(lines + ['};', '', '''export function getAutoPlayRoundaboutExitImage(exitNumber) {
    const normalizedExitNumber = Number(exitNumber);

    if (!Number.isInteger(normalizedExitNumber)) {
        return null;
    }

    return ROUNDABOUT_EXIT_IMAGES[normalizedExitNumber] ?? null;
}''', ''])
    return files


def outputs(include_automotive=False):
    manifest = json.loads((ASSETS / 'manifest.json').read_text())
    icons = {}
    files = {}
    for kind, upstream_path in manifest['icons'].items():
        icon = parse_svg((ASSETS / Path(upstream_path).name).read_text())
        icons[kind] = icon
        files[DRAWABLES / f"maneuver_{kind.replace('-', '_')}.xml"] = vector(icon, kind == 'roundabout')
    files[MOBILE] = '// Generated by expo/scripts/generate-maneuver-icons.py. Do not edit.\nexport const maneuverIcons = ' + json.dumps(icons, indent=4) + ';\n'
    if include_automotive:
        files.update(automotive_outputs(icons))
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--automotive', action='store_true', help='Also render automotive PNGs using ImageMagick.')
    args = parser.parse_args()
    stale = []
    for path, content in outputs(args.automotive).items():
        data = content if isinstance(content, bytes) else content.encode()
        if args.check:
            if not path.exists() or path.read_bytes() != data:
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    if stale:
        parser.exit(1, 'Stale maneuver assets:\n' + '\n'.join(stale) + '\n')
    print('Maneuver assets are current.' if args.check else 'Generated maneuver assets.')


if __name__ == '__main__':
    main()
