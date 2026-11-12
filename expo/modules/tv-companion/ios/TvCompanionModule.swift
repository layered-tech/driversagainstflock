import ExpoModulesCore
import Network
import Security
import CryptoKit

public class TvCompanionModule: Module {
    public func definition() -> ModuleDefinition {
        Name("TvCompanion")
        AsyncFunction("request") { (host: String, port: Int, fingerprint: String, payload: String, promise: Promise) in
            let octets = host.split(separator: ".").compactMap { UInt8($0) }
            let local = octets.count == 4 && (octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && (16...31).contains(octets[1])))
            guard local, (1...65535).contains(port), fingerprint.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                payload.utf8.count <= 1_048_576, !payload.contains("\n") else {
                promise.reject("INVALID_TV", "Scan the QR code shown on your TV.")
                return
            }
            TvRequest(host: host, port: UInt16(port), fingerprint: fingerprint, payload: payload, promise: promise).start()
        }
    }
}

private final class TvRequest {
    private let queue = DispatchQueue(label: "org.driversagainstflock.tv-request")
    private var connection: NWConnection!
    private let promise: Promise
    private let payload: Data
    private var received = Data()
    private var finished = false
    private var timeout: DispatchWorkItem?

    init(host: String, port: UInt16, fingerprint: String, payload: String, promise: Promise) {
        self.promise = promise
        self.payload = Data((payload + "\n").utf8)
        let tls = NWProtocolTLS.Options()
        sec_protocol_options_set_min_tls_protocol_version(tls.securityProtocolOptions, .TLSv12)
        sec_protocol_options_set_verify_block(tls.securityProtocolOptions, { _, trust, complete in
            let trustRef = sec_trust_copy_ref(trust).takeRetainedValue()
            guard let chain = SecTrustCopyCertificateChain(trustRef) as? [SecCertificate], let certificate = chain.first else { complete(false); return }
            let data = SecCertificateCopyData(certificate) as Data
            let actual = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            complete(actual == fingerprint)
        }, queue)
        connection = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port)!, using: NWParameters(tls: tls))
    }

    func start() {
        let deadline = DispatchWorkItem { [self] in fail("The TV did not respond. Check that both devices use the same Wi-Fi.") }
        timeout = deadline
        queue.asyncAfter(deadline: .now() + 12, execute: deadline)
        connection.stateUpdateHandler = { [self] state in
            switch state {
            case .ready:
                connection.send(content: payload, completion: .contentProcessed { [self] error in
                    if error != nil { fail("Could not send to TV.") } else { read() }
                })
            case .failed: fail("Could not connect securely to this TV. Scan its QR code again.")
            default: break
            }
        }
        connection.start(queue: queue)
    }

    private func read() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [self] data, _, complete, error in
            guard !finished else { return }
            if let data = data { received.append(data) }
            if received.count > 1_048_576 { fail("TV response too large."); return }
            if let newline = received.firstIndex(of: 10) {
                guard let value = String(data: received.prefix(upTo: newline), encoding: .utf8) else { fail("Invalid TV response."); return }
                finish(); promise.resolve(value)
            } else if complete || error != nil { fail("TV disconnected.") }
            else { read() }
        }
    }
    private func finish() {
        finished = true
        timeout?.cancel(); timeout = nil
        connection.stateUpdateHandler = nil
        connection.cancel()
    }
    private func fail(_ message: String) {
        guard !finished else { return }
        finish(); promise.reject("TV_CONNECTION", message)
    }
}
