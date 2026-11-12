import { TV_PROTOCOL_VERSION } from './tv-contract.js';

export function parseTvPairingUri(value) {
    if (typeof value !== 'string') return null;
    const match = /^daf-tv:\/\/pair\?([^#]+)$/.exec(value.trim());
    if (!match) return null;
    let params;
    try {
        params = new globalThis.URLSearchParams(match[1]);
    } catch {
        return null;
    }
    const host = params.get('host');
    const octets = host?.split('.').map(Number);
    if (
        !/^\d{1,3}(\.\d{1,3}){3}$/.test(host ?? '') ||
        octets.some((n) => n > 255)
    )
        return null;
    if (!(
        octets[0] === 10 ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    ))
        return null;
    const port = Number(params.get('port'));
    const fingerprint = params.get('fingerprint');
    const code = params.get('code');
    if (
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535 ||
        !/^[a-f0-9]{64}$/.test(fingerprint ?? '') ||
        !/^[A-HJ-NP-Z2-9]{6}$/.test(code ?? '')
    )
        return null;
    return { host, port, fingerprint, code };
}

export function tvPairingUriFromLinkParams(params) {
    const values = [
        params.tvHost,
        params.tvPort,
        params.tvFingerprint,
        params.tvCode,
    ];
    if (values.some((value) => typeof value !== 'string')) return null;
    const uri = `daf-tv://pair?host=${values[0]}&port=${values[1]}&fingerprint=${values[2]}&code=${values[3]}`;
    return parseTvPairingUri(uri) ? uri : null;
}

export function createTvClient({ transport, credentials, clock = Date.now }) {
    let lastRevision = 0;
    async function send(peer, operation, values = {}) {
        const raw = await transport.request(
            peer.host,
            peer.port,
            peer.fingerprint,
            JSON.stringify({
                ...values,
                operation,
                protocolVersion: TV_PROTOCOL_VERSION,
            }),
        );
        const response = JSON.parse(raw);
        if (
            response.protocolVersion !== TV_PROTOCOL_VERSION ||
            response.ok !== true
        ) {
            const error = new Error(
                response.error === 'not-paired'
                    ? 'This TV is no longer paired. Scan its QR code again.'
                    : `TV request failed: ${response.error ?? 'invalid-response'}`,
            );
            error.code = response.error;
            throw error;
        }
        return response;
    }
    return {
        async pair(uri) {
            const peer = parseTvPairingUri(uri);
            if (!peer) throw new Error('Scan the QR code shown on your TV.');
            const response = await send(peer, 'pair', { code: peer.code });
            if (!/^[A-Za-z0-9_-]{43}$/.test(response.token ?? ''))
                throw new Error('TV returned an invalid pairing credential.');
            const address = {
                host: peer.host,
                port: peer.port,
                fingerprint: peer.fingerprint,
            };
            try {
                await credentials.set({ ...address, token: response.token });
            } catch (error) {
                await send(address, 'unpair', { token: response.token }).catch(
                    () => {},
                );
                throw error;
            }
        },
        async sync(snapshot) {
            const peer = await credentials.get();
            if (!peer) return false;
            lastRevision = Math.max(clock(), lastRevision + 1);
            await send(peer, 'snapshot', {
                token: peer.token,
                revision: lastRevision,
                snapshot,
            });
            return true;
        },
        async poll() {
            const peer = await credentials.get();
            if (!peer) return [];
            const response = await send(peer, 'poll', { token: peer.token });
            return Array.isArray(response.actions)
                ? response.actions
                      .filter((action) =>
                          ['camera', 'watch-camera'].includes(action?.type),
                      )
                      .slice(0, 20)
                : [];
        },
        async acknowledge(id) {
            const peer = await credentials.get();
            if (peer) await send(peer, 'ack', { token: peer.token, id });
        },
        async unpair() {
            const peer = await credentials.get();
            await credentials.clear();
            if (peer) {
                // Forget locally even when the TV is offline or its identity changed.
                void send(peer, 'unpair', { token: peer.token }).catch(
                    () => {},
                );
            }
        },
    };
}
