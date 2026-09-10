import { compileTemplate } from '@vue/compiler-sfc';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import * as Vue from 'vue';

const source = await readFile(
    new URL('../Pages/Moderation/Index.vue', import.meta.url),
    'utf8',
);
const opening = source.match(
    /<tr\s+class="border-b border-daf-border hover:[\s\S]*?>/,
)[0];
const { code, errors } = compileTemplate({
    source: `${opening}</tr>`,
    filename: 'ModerationRow.vue',
    id: 'moderation-row',
});
assert.deepEqual(errors, []);
const render = new Function(
    'Vue',
    code
        .replace(
            /import \{([^}]+)\} from "vue"/g,
            (_, names) => `const {${names.replaceAll(' as ', ': ')}} = Vue`,
        )
        .replace('export function render', 'return function render'),
)(Vue);

for (const view of [
    'changesets',
    'nodes',
    'flagged',
    'areas',
    'editors',
    'activity',
]) {
    test(`${view} rows toggle only when expandable and clicked outside controls`, () => {
        let expanded = false;
        const row = { id: 123 };
        const vnode = render(
            {
                view,
                row,
                isChangesets: view === 'changesets',
                isNodes: ['nodes', 'flagged'].includes(view),
                expand(value) {
                    assert.equal(value, row);
                    expanded = !expanded;
                },
            },
            [],
        );
        const click = (tag) =>
            vnode.props.onClick?.({
                target: {
                    closest(selector) {
                        return selector
                            .split(',')
                            .map((part) => part.trim())
                            .includes(tag)
                            ? {}
                            : null;
                    },
                },
            });
        click('td');
        assert.equal(expanded, !['editors', 'activity'].includes(view));
        click('span');
        assert.equal(expanded, false);
        for (const tag of [
            'a',
            'button',
            'input',
            'select',
            'textarea',
            'summary',
            'label',
        ]) {
            click(tag);
            assert.equal(expanded, false, `${tag} must keep its own action`);
        }
    });
}
