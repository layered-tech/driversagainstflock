<script setup>
import Modal from '@/Components/Modal.vue';
import DafIcon from '@/Components/Daf/DafIcon.vue';
import { flagSummary, severityClass } from '@/moderationFlags';
import { parseDirectionValues } from '@/direction-values';
import { locationLabel } from '@/moderation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue';
import { Link, router, useHttp, usePage } from '@inertiajs/vue3';
import { computed, inject, ref } from 'vue';

const props = defineProps({
    node: { type: Object, required: true },
    osmUrl: String,
});
const route = inject('route');
const page = usePage();
const dialog = ref(null);
const menuPosition = ref({});
const authorized = ref(false);
const error = ref('');
const loading = ref(false);
const sent = ref(false);
const editable = ref(false);
const template = ref('ask');
const attachLink = ref(true);
const recipient = ref(null);
const directionKey = ref('direction');
const fields = [
    [
        'operator',
        [
            'Flock Safety',
            'Motorola Solutions',
            'Vigilant',
            'City of Austin',
            'Axon',
        ],
    ],
    ['surveillance', ['public', 'traffic', 'outdoor']],
    [
        'camera:mount',
        ['pole', 'wall', 'street_lamp', 'traffic_signals', 'gantry'],
    ],
    ['camera:type', ['fixed', 'dome', 'panning']],
];
const flag = computed(() =>
    props.node.flags?.find((flag) => flag.status === 'open'),
);
const adjustment = useHttp({
    flag_id: null,
    action: 'adjust',
    version: null,
    tags: {},
    latitude: null,
    longitude: null,
    comment: '',
    confirmed: false,
});
const message = useHttp({
    recipient_id: null,
    version: null,
    subject: '',
    body: '',
});
const busy = computed(
    () => loading.value || adjustment.processing || message.processing,
);
const nodeUrl = computed(() => `${props.osmUrl}/node/${props.node.id}`);
const messageBody = computed(
    () => message.body + (attachLink.value ? `\n\n${nodeUrl.value}` : ''),
);
const recipientName = computed(
    () => recipient.value?.user || props.node.osm_user || 'Unknown',
);
const initials = computed(() =>
    recipientName.value
        .split(/[\s_.-]+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
);
function positionMenu(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const below = box.bottom + 150 < window.innerHeight;
    menuPosition.value = {
        left: `${Math.max(8, box.right - 236)}px`,
        top: `${below ? box.bottom + 6 : box.top - 144}px`,
    };
}
function compose(kind) {
    template.value = kind;
    const name = recipientName.value;
    const greeting = `Hi ${name},\n\n`;
    const signature = `\n\nThanks for mapping,\n${page.props.auth.user.name} · DAF moderation`;
    message.subject = `${kind === 'fix' ? 'Follow-up' : kind === 'ask' ? 'Quick question' : 'About'} ALPR node ${props.node.id}`;
    message.body =
        kind === 'blank'
            ? greeting
            : kind === 'fix'
              ? `${greeting}I'm following up on ALPR node ${props.node.id} near ${locationLabel(props.node)}. Could you review its tags and position against your survey notes? Let me know if you saw something different on the ground.${signature}`
              : `${greeting}Thanks for mapping the camera near ${locationLabel(props.node)}. This node has been flagged for:\n\n${(props.node.flags || []).map((flag) => `• ${flagSummary(flag, props.node.id)}`).join('\n')}\n\nCould you confirm whether the camera is still there and check this against your survey notes or a photo? You can update the node or reply here.${signature}`;
}
async function open(kind) {
    dialog.value = kind;
    authorized.value = false;
    error.value = '';
    sent.value = false;
    loading.value = true;
    adjustment.clearErrors();
    message.clearErrors();
    if (kind === 'message') {
        recipient.value = null;
        attachLink.value = true;
        compose('ask');
    }
    try {
        if (kind === 'adjust') {
            adjustment.flag_id = flag.value.id;
            const state = await adjustment.get(
                route('moderation.nodes.osm-edit.show', {
                    node: props.node.id,
                    flag_id: flag.value.id,
                    adjust: 1,
                }),
            );
            authorized.value = state.authorized;
            editable.value = state.actions.includes('adjust');
            const node = state.node || {
                version: props.node.osm_version,
                tags: props.node.tags,
                lat: props.node.latitude,
                lon: props.node.longitude,
            };
            adjustment.version = node.version;
            adjustment.tags = Object.fromEntries(
                state.tag_keys.map((key) => [key, node.tags?.[key] ?? '']),
            );
            directionKey.value =
                node.tags?.['camera:direction'] != null
                    ? 'camera:direction'
                    : 'direction';
            const direction = parseDirectionValues(
                adjustment.tags[directionKey.value],
            );
            if (direction.length === 1)
                adjustment.tags[directionKey.value] = String(direction[0]);
            adjustment.latitude = node.lat;
            adjustment.longitude = node.lon;
            adjustment.comment = '';
            adjustment.confirmed = false;
        } else {
            const state = await message.get(
                route('moderation.nodes.message.show', props.node.id),
            );
            authorized.value = state.authorized;
            if (state.node) {
                recipient.value = state.node;
                message.recipient_id = state.node.uid;
                message.version = state.node.version;
                compose('ask');
            }
        }
    } catch {
        error.value =
            Object.values(
                kind === 'adjust' ? adjustment.errors : message.errors,
            ).join(' ') || 'This action could not be loaded. Please try again.';
    } finally {
        loading.value = false;
    }
}
async function saveAdjustment() {
    if (
        busy.value ||
        !authorized.value ||
        !editable.value ||
        !adjustment.confirmed
    )
        return;
    error.value = '';
    try {
        const result = await adjustment.post(
            route('moderation.nodes.osm-edit.store', props.node.id),
        );
        if (result.recorded === false || !result.closed || !result.verified) {
            error.value = `Saved to OSM in changeset #${result.changeset_id}. Check OSM history before making further changes; the follow-up could not be fully confirmed.`;
            editable.value = false;
            return;
        }
        dialog.value = null;
        router.reload({ preserveScroll: true });
    } catch {
        error.value =
            Object.values(adjustment.errors).join(' ') ||
            'The edit response could not be confirmed. Check OSM history before retrying.';
    }
}
async function sendMessage() {
    if (
        busy.value ||
        !authorized.value ||
        sent.value ||
        !message.subject.trim() ||
        !message.body.trim()
    )
        return;
    error.value = '';
    const draft = message.body;
    message.body = messageBody.value;
    try {
        await message.post(
            route('moderation.nodes.message.store', props.node.id),
        );
        sent.value = true;
    } catch {
        error.value =
            Object.values(message.errors).join(' ') ||
            'The message response could not be confirmed. Check your OSM outbox before retrying.';
    } finally {
        message.body = draft;
    }
}
function close() {
    if (!busy.value) dialog.value = null;
}
</script>
<template>
    <Menu as="div">
        <MenuButton
            class="inline-flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-dafPill bg-[var(--brand-soft)] px-3 text-xs font-bold text-daf-text-brand"
            @click="positionMenu"
        >
            Take action <DafIcon :size="13" name="chevron-down" />
        </MenuButton>
        <Teleport to="body">
            <MenuItems
                :style="menuPosition"
                class="moderation-page fixed z-40 w-[236px] rounded-dafMd border border-daf-border bg-daf-surface-card p-1.5 font-ui shadow-dafFloat focus:outline-none"
            >
                <div class="mod-label px-2.5 pb-1 pt-1.5">
                    Node {{ node.id }}
                </div>
                <MenuItem v-slot="{ active }" :disabled="!flag">
                    <button
                        :class="[
                            'mod-action-item',
                            active && 'bg-[var(--brand-soft)]',
                        ]"
                        :disabled="!flag"
                        @click="open('adjust')"
                    >
                        <DafIcon :size="18" name="sliders-horizontal" /><span
                            ><strong class="block text-[13px] font-semibold"
                                >Adjust node</strong
                            ><span class="text-[11px] text-daf-text-tertiary"
                                >Fix tags, position or direction</span
                            ></span
                        >
                    </button>
                </MenuItem>
                <MenuItem v-slot="{ active }" :disabled="!node.osm_uid">
                    <button
                        :class="[
                            'mod-action-item',
                            active && 'bg-[var(--brand-soft)]',
                        ]"
                        :disabled="!node.osm_uid"
                        @click="open('message')"
                    >
                        <DafIcon :size="18" name="mail" /><span
                            ><strong class="block text-[13px] font-semibold"
                                >Message user</strong
                            ><span class="text-[11px] text-daf-text-tertiary">{{
                                node.osm_user ||
                                node.osm_uid ||
                                'Editor unavailable'
                            }}</span></span
                        >
                    </button>
                </MenuItem>
            </MenuItems>
        </Teleport>
    </Menu>
    <Modal
        :closeable="!busy"
        :show="dialog !== null"
        max-width="2xl"
        @close="close"
    >
        <div
            class="moderation-page bg-daf-surface-card p-6 font-ui text-daf-text-primary"
        >
            <div class="mb-5 flex items-start justify-between gap-4">
                <div>
                    <h2 class="font-display text-2xl font-bold">
                        {{
                            dialog === 'adjust' ? 'Adjust node' : 'Message user'
                        }}
                    </h2>
                    <p class="mt-1 text-[13px] text-daf-text-secondary">
                        {{
                            dialog === 'adjust'
                                ? 'Changes save as an OSM changeset from your account. Rule checks refresh after the edit.'
                                : 'Sent as an OSM message from your account. Most flags are honest mistakes — keep it friendly.'
                        }}
                    </p>
                </div>
                <button
                    :disabled="busy"
                    aria-label="Close action"
                    class="mod-expand"
                    @click="close"
                >
                    <DafIcon :size="18" name="x" />
                </button>
            </div>
            <p v-if="loading" class="mb-4 animate-pulse text-sm" role="status">
                Loading current OpenStreetMap data…
            </p>
            <p
                v-if="error"
                class="mb-4 text-sm text-[var(--alert-600)]"
                role="alert"
            >
                {{ error }}
            </p>
            <p
                v-if="sent"
                class="rounded-dafSm bg-[var(--brand-soft)] p-3 text-sm text-daf-text-brand"
                role="status"
            >
                Message sent to {{ recipientName }} on OpenStreetMap.
            </p>
            <form
                v-else-if="!loading"
                class="flex flex-col gap-4"
                @submit.prevent="
                    dialog === 'adjust' ? saveAdjustment() : sendMessage()
                "
            >
                <div
                    v-if="dialog === 'message'"
                    class="flex items-center gap-3 rounded-dafSm border border-daf-border bg-daf-surface-page p-3"
                >
                    <span
                        class="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-bold text-daf-text-brand"
                        >{{ initials }}</span
                    >
                    <div class="min-w-0 flex-1">
                        <div class="text-[13.5px] font-bold">
                            {{ recipientName }}
                        </div>
                        <div class="text-xs text-daf-text-secondary">
                            UID {{ recipient?.uid || node.osm_uid }} · changed
                            this node
                        </div>
                    </div>
                    <Link
                        :href="
                            route(
                                'moderation.editors.show',
                                recipient?.uid || node.osm_uid,
                            )
                        "
                        class="mod-link"
                        >View profile</Link
                    >
                </div>
                <div
                    class="flex flex-wrap items-center gap-2 rounded-dafSm border border-daf-border p-3 text-xs"
                >
                    <span class="font-mono font-bold">Node {{ node.id }}</span
                    ><span class="text-daf-text-secondary">{{
                        locationLabel(node)
                    }}</span>
                    <span
                        v-for="item in node.flags"
                        :key="item.id"
                        :class="severityClass(item.rule?.severity)"
                        class="mod-rule-tag"
                        ><span class="mod-severity-dot" />{{
                            item.source === 'alpr_presence'
                                ? `Not there · ${item.evidence?.report_count ?? '—'}`
                                : item.rule?.name || 'Rule unavailable'
                        }}</span
                    >
                </div>
                <template v-if="dialog === 'adjust'">
                    <fieldset
                        :disabled="!authorized || !editable || busy"
                        class="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2"
                    >
                        <label class="mod-field-label"
                            >Latitude<input
                                v-model="adjustment.latitude"
                                class="mod-dialog-input font-mono"
                                max="90"
                                min="-90"
                                required
                                step="any"
                                type="number"
                        /></label>
                        <label class="mod-field-label"
                            >Longitude<input
                                v-model="adjustment.longitude"
                                class="mod-dialog-input font-mono"
                                max="180"
                                min="-180"
                                required
                                step="any"
                                type="number"
                        /></label>
                        <label class="mod-field-label"
                            >Direction · degrees<input
                                v-model="adjustment.tags[directionKey]"
                                class="mod-dialog-input font-mono"
                                max="359.999"
                                min="0"
                                placeholder="Leave blank for none"
                                step="any"
                                type="number"
                        /></label>
                        <label
                            v-for="[key, options] in fields"
                            :key="key"
                            class="mod-field-label"
                            >{{ key
                            }}<select
                                v-model="adjustment.tags[key]"
                                class="mod-dialog-input"
                            >
                                <option
                                    v-for="value in [
                                        ...new Set([
                                            '',
                                            adjustment.tags[key],
                                            ...options,
                                        ]),
                                    ]"
                                    :key="value"
                                    :value="value"
                                >
                                    {{ value || '(missing)' }}
                                </option>
                            </select></label
                        >
                        <div class="mod-field-label">
                            surveillance:type
                            <div
                                class="flex h-[38px] items-center rounded-dafSm border border-dashed border-daf-border px-3 font-mono text-[13px] normal-case tracking-normal text-daf-text-tertiary"
                            >
                                ALPR · fixed by the node class
                            </div>
                        </div>
                        <label class="mod-field-label sm:col-span-2"
                            >Changeset comment<textarea
                                v-model="adjustment.comment"
                                class="mod-dialog-input !h-auto py-2.5"
                                maxlength="255"
                                minlength="5"
                                placeholder="Explain the evidence and change"
                                required
                                rows="2"
                            />
                        </label>
                        <label
                            class="flex items-start gap-2 text-xs sm:col-span-2"
                            ><input
                                v-model="adjustment.confirmed"
                                required
                                type="checkbox"
                            />I reviewed the evidence and confirm this
                            edit.</label
                        >
                    </fieldset>
                    <p
                        v-if="authorized && !editable"
                        class="text-sm text-daf-text-secondary"
                    >
                        This flag is no longer actionable. Refresh to review its
                        current status.
                    </p>
                </template>
                <template v-else>
                    <div>
                        <div class="mod-label mb-1.5">Start from</div>
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                v-for="[key, label] in [
                                    ['ask', 'Ask for details'],
                                    ['fix', 'Heads-up / fix'],
                                    ['blank', 'Blank message'],
                                ]"
                                :key="key"
                                :aria-pressed="template === key"
                                :class="[
                                    'mod-chip !h-8',
                                    template === key && 'mod-chip-active',
                                ]"
                                type="button"
                                @click="compose(key)"
                            >
                                {{ label }}
                            </button>
                        </div>
                    </div>
                    <label class="mod-field-label"
                        >Subject<input
                            v-model="message.subject"
                            class="mod-dialog-input"
                            maxlength="255"
                            required
                    /></label>
                    <label class="mod-field-label"
                        >Message<textarea
                            v-model="message.body"
                            class="mod-dialog-input !h-auto py-2.5"
                            maxlength="10000"
                            placeholder="Say what you noticed and what would help"
                            required
                            rows="9"
                        />
                    </label>
                    <div class="flex items-center justify-between gap-3">
                        <label
                            class="flex items-center gap-2 text-xs font-semibold"
                            ><input
                                v-model="attachLink"
                                type="checkbox"
                            />Attach a link to the node</label
                        ><span
                            class="font-mono text-[11px] text-daf-text-tertiary"
                            >{{ messageBody.length }} characters</span
                        >
                    </div>
                </template>
                <div class="flex flex-wrap items-center gap-2.5 pt-1">
                    <a
                        :href="
                            dialog === 'adjust'
                                ? `${osmUrl}/edit?editor=id&node=${node.id}`
                                : `${osmUrl}/messages/inbox`
                        "
                        class="mod-button !h-[38px]"
                        rel="noopener noreferrer"
                        target="_blank"
                        >{{
                            dialog === 'adjust'
                                ? 'Open in OSM ↗'
                                : 'Open OSM inbox ↗'
                        }}</a
                    >
                    <div class="ml-auto flex gap-2.5">
                        <button
                            :disabled="busy"
                            class="mod-button !h-[38px]"
                            type="button"
                            @click="close"
                        >
                            Cancel
                        </button>
                        <a
                            v-if="!authorized"
                            :href="
                                route('moderation.osm.edit.authorize', {
                                    node: node.id,
                                    ...(dialog === 'message'
                                        ? { capability: 'messages' }
                                        : {}),
                                })
                            "
                            class="mod-primary-button"
                            >{{
                                dialog === 'message'
                                    ? 'Authorize messaging'
                                    : 'Authorize editing'
                            }}</a
                        >
                        <button
                            v-else
                            :disabled="
                                busy ||
                                (dialog === 'adjust'
                                    ? !editable || !adjustment.confirmed
                                    : !message.subject.trim() ||
                                      !message.body.trim() ||
                                      messageBody.length > 10000 ||
                                      !message.recipient_id)
                            "
                            class="mod-primary-button"
                            type="submit"
                        >
                            {{
                                busy
                                    ? 'Saving…'
                                    : dialog === 'adjust'
                                      ? 'Save to OSM'
                                      : 'Send message'
                            }}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    </Modal>
</template>
