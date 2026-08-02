import { createRequire } from 'node:module';
import eslint from '@eslint/js';
import eslintPluginVue from 'eslint-plugin-vue';

const require = createRequire(import.meta.url);
const requireVuePrettier = createRequire(
    require.resolve('@vue/eslint-config-prettier'),
);
const eslintPluginPrettier = requireVuePrettier('eslint-plugin-prettier');
const eslintConfigPrettier = requireVuePrettier('eslint-config-prettier');

export default [
    {
        ignores: ['bootstrap/ssr/**', 'node_modules/**', 'public/**'],
    },
    eslint.configs.recommended,
    ...eslintPluginVue.configs['flat/essential'],
    eslintConfigPrettier,
    {
        files: ['resources/js/**/*.{js,vue}'],
        plugins: {
            prettier: eslintPluginPrettier,
        },
        rules: {
            'no-undef': 'off',
            'prettier/prettier': 'warn',
            'vue/multi-word-component-names': 'off',
        },
    },
];
