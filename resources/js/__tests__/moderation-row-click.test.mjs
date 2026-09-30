import { compileTemplate } from '@vue/compiler-sfc';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import * as Vue from 'vue';

const source = await readFile(
    new URL('../Components/Moderation/ModerationListing.vue', import.meta.url),
    'utf8',
);
const rowClass =
    'class="border-b border-daf-border hover:bg-[color-mix(in_oklab,var(--brand)_4%,var(--surface-card))]';
const classOffset = source.indexOf(rowClass);
const openingOffset = source.lastIndexOf('<tr', classOffset);
const openingTerminator = '\n                                >';
const openingEnd = source.indexOf(openingTerminator, classOffset);
const opening = source.slice(
    openingOffset,
    openingEnd + openingTerminator.length,
);
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
    'audit',
]) {
    test(`${view} rows toggle only when expandable and clicked outside controls`, () => {
        let expanded = false;
        const row = { id: 123 };
        const expandable = !['editors', 'audit'].includes(view);
        const vnode = render(
            {
                view,
                row,
                isChangesets: view === 'changesets',
                isNodes: ['nodes', 'flagged'].includes(view),
                expanded: null,
                rowKey: (value) => `${view}:${value.id}`,
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
        assert.equal(expanded, expandable);
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

        assert.equal(vnode.props.tabindex, expandable ? 0 : undefined);
        assert.equal(
            vnode.props['aria-expanded'],
            expandable ? false : undefined,
        );
        assert.match(
            vnode.props.class,
            /focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-\[var\(--brand\)\]/,
        );

        const keydown = (key, nested = false) => {
            const currentTarget = {};
            const event = {
                key,
                target: nested ? {} : currentTarget,
                currentTarget,
                preventDefault() {},
                stopPropagation() {},
            };
            for (const handler of [vnode.props.onKeydown]
                .flat()
                .filter(Boolean)) {
                handler(event);
            }
        };
        keydown('Enter');
        assert.equal(expanded, expandable);
        keydown(' ');
        assert.equal(expanded, false);
        keydown('Enter', true);
        assert.equal(expanded, false);
    });
}
