import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaTextClassName } from '../../areas/area-typography.js';
import { loadTourModule } from '../../map/__tests__/tour-test-helpers.mjs';

function typography(edge, tablet = false) {
    const fonts = [
        'HankenGrotesk-Regular',
        'HankenGrotesk-Medium',
        'HankenGrotesk-SemiBold',
        'HankenGrotesk-Bold',
        'Geist-Bold',
        'JetBrainsMono-Regular',
        'JetBrainsMono-SemiBold',
        'JetBrainsMono-Bold',
    ];
    return loadTourModule(new URL('../duo-typography.js', import.meta.url), {
        'expo-font': { useFonts: () => [true, null] },
        react: { forwardRef: (component) => component },
        'react-native': {
            Platform: { isPad: tablet },
            Text: 'Text',
            TextInput: 'TextInput',
        },
        '../areas/area-typography': { areaTextClassName },
        '../root/duo-device-context': { useDuoDevice: () => Boolean(edge) },
        ...Object.fromEntries(
            fonts.map((font) => [`../../assets/fonts/${font}.ttf`, font]),
        ),
    });
}

test('Duo typography uses the design display, body, and data families at their actual weights', () => {
    const { DuoText } = typography('trailing');
    for (const [input, expected] of [
        ['font-dafDisplay text-[21px] font-bold', 'font-areaDisplay'],
        ['text-[13px] font-semibold', 'font-areaSemibold'],
        ['text-[13px] font-medium', 'font-areaMedium'],
        ['text-[13px]', 'font-areaRegular'],
        ['font-dafMono text-xs font-semibold', 'font-areaMonoSemibold'],
        ['font-dafMono text-[22px] font-extrabold', 'font-areaMonoBold'],
        ['font-black', 'font-areaBold'],
    ]) {
        const node = DuoText({ className: input, children: 'Content' });
        assert.ok(node.props.className.includes(expected));
        assert.doesNotMatch(
            node.props.className,
            /font-(bold|semibold|medium|extrabold|black)\b/,
        );
    }
});

test('iPad uses the same bundled design fonts without being identified as a Duo', () => {
    const { DuoText, DuoTextInput } = typography(null, true);
    assert.match(
        DuoText({ className: 'font-bold' }).props.className,
        /font-areaBold/,
    );
    assert.match(
        DuoTextInput({ className: 'font-medium' }).props.className,
        /font-areaMedium/,
    );
});

test('text inputs retain their ref and callbacks and ordinary phones retain the existing typography', () => {
    const ref = {};
    const onChangeText = () => {};
    const input = typography('leading').DuoTextInput(
        { className: 'font-medium text-[16px]', onChangeText },
        ref,
    );
    assert.equal(input.props.ref, ref);
    assert.equal(input.props.onChangeText, onChangeText);
    assert.match(input.props.className, /font-areaMedium/);
    assert.equal(
        typography(null).DuoText({
            className: 'font-semibold',
            children: 'Content',
        }).props.className,
        'font-semibold',
    );
});
