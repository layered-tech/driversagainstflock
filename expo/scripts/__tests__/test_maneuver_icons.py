import importlib.util
import tempfile
import sys
import shutil
import subprocess
from unittest.mock import patch
from contextlib import redirect_stderr
from io import StringIO
import unittest
from pathlib import Path

GENERATOR = Path(__file__).resolve().parents[1] / 'generate-maneuver-icons.py'
spec = importlib.util.spec_from_file_location('maneuver_icons', GENERATOR)
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class ManeuverIconGenerationTest(unittest.TestCase):
    def roundabout(self):
        return generator.parse_svg((generator.ASSETS / 'roundabout.svg').read_text())

    def test_roundabout_arrows_are_enlarged_without_changing_mapbox_geometry(self):
        icon = self.roundabout()
        svg = generator.ET.fromstring(generator.automotive_svg(icon, True))
        group = svg.find(generator.SVG + 'g')
        self.assertEqual(group.get('transform'), 'translate(-3 -3) scale(1.3)')
        self.assertEqual(group.find(generator.SVG + 'path').get('d'), icon['paths'][0]['d'])
        vector = generator.ET.fromstring(generator.vector(icon, True))
        group = vector.find('group')
        namespace = '{http://schemas.android.com/apk/res/android}'
        self.assertEqual(group.get(namespace + 'scaleX'), '1.3')
        self.assertEqual(group.get(namespace + 'pivotX'), '10')
        self.assertEqual(group.find('path').get(namespace + 'pathData'), icon['paths'][0]['d'])

    @unittest.skipUnless(shutil.which('magick'), 'ImageMagick is needed for raster verification')
    def test_automotive_numbers_are_inside_mapbox_arrows_not_replacement_circles(self):
        def pixels(png):
            return subprocess.run(['magick', 'png:-', '-depth', '8', 'rgba:-'], input=png, capture_output=True, check=True).stdout
        icon = self.roundabout()
        base_png = generator.automotive_png(icon, True)
        self.assertEqual(base_png, (generator.AUTOMOTIVE / 'maneuvers/roundabout.png').read_bytes())
        base = pixels(base_png)
        for number in [1, 2, 12, 19]:
            png = generator.automotive_png(icon, True, number)
            self.assertEqual(png, (generator.AUTOMOTIVE / 'roundabout-exits' / f'roundabout-exit-{number}.png').read_bytes())
            self.assertEqual(png, generator.automotive_png(icon, True, number))
            numbered = pixels(png)
            changes = [(index % 128, index // 128) for index in range(128 * 128)
                if base[index * 4:index * 4 + 4] != numbered[index * 4:index * 4 + 4]]
            self.assertTrue(changes)
            self.assertTrue(all(38 <= x <= 90 and 38 <= y <= 90 for x, y in changes))
            self.assertLess(abs((min(x for x, y in changes) + max(x for x, y in changes)) / 2 - 64), 5)
            self.assertLess(abs((min(y for x, y in changes) + max(y for x, y in changes)) / 2 - 64), 5)

    def test_watch_app_and_tile_center_exit_over_the_icon(self):
        watch = generator.ROOT / 'wear-os/app/src/main/java/org/driversagainstflock/watch'
        app = (watch / 'WatchApp.kt').read_text().split('@Composable private fun ManeuverIcon(')[1].split('internal fun maneuverResourceId')[0]
        tile = (watch / 'WatchQuickAccess.kt').read_text().split('val maneuverGroup = ')[1].split('center.addContent(Row.Builder()')[0]
        self.assertIn('Box(contentAlignment = Alignment.Center', app)
        self.assertNotIn('.border(', app)
        self.assertIn('maneuverExitTextSize(exitNumber, 56f)', app)
        self.assertIn('Box.Builder().setWidth(dp(40f)).setHeight(dp(40f))', tile)
        self.assertIn('maneuverExitTextSize(exit, 40f)', tile)
        self.assertNotIn('setBorder', tile)

    def svg(self, content):
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">' + content + '</svg>'

    def test_preserves_fill_rule_and_converts_translation(self):
        icon = generator.parse_svg(self.svg('<path fill="none" fill-rule="evenodd" transform="translate(2, -3)" d="M0 0h5v5Z"/>'))
        self.assertEqual(icon['paths'][0]['translate'], [2, -3])
        self.assertEqual(icon['paths'][0]['fill'], 'none')
        self.assertIn('android:translateX="2"', generator.vector(icon))
        self.assertIn('android:translateY="-3"', generator.vector(icon))
        self.assertIn('android:fillType="evenOdd"', generator.vector(icon))
        self.assertIn('android:fillColor="#00000000"', generator.vector(icon))

    def test_rejects_constructs_that_cannot_be_preserved(self):
        for content in [
            '<rect width="20" height="20"/>',
            '<g><path d="M0 0Z"/></g>',
            '<path style="fill:red" d="M0 0Z"/>',
            '<path transform="skewX(20)" d="M0 0Z"/>',
            '<path stroke="black" d="M0 0Z"/>',
            '<path fill="red" d="M0 0Z"/>',
        ]:
            with self.subTest(content=content), self.assertRaises(ValueError):
                generator.parse_svg(self.svg(content))

    def test_generated_content_is_deterministic(self):
        self.assertEqual(generator.outputs(), generator.outputs())

    def test_check_reports_missing_and_stale_files_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            stale = root / 'stale.xml'
            missing = root / 'missing.js'
            stale.write_text('old')
            with patch.object(generator, 'ROOT', root), patch.object(generator, 'outputs', return_value={stale: 'new', missing: 'generated'}), patch.object(sys, 'argv', ['generate', '--check']), redirect_stderr(StringIO()):
                with self.assertRaises(SystemExit) as error:
                    generator.main()
                self.assertEqual(error.exception.code, 1)
            self.assertEqual(stale.read_text(), 'old')
            self.assertFalse(missing.exists())


if __name__ == '__main__':
    unittest.main()
