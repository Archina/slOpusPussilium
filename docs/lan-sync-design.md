# Local-Network Deck Sharing and Device Sync

Status: Phase 1 and initial Phase 2 implementation in progress

Implemented so far:
- Immutable local event log in IndexedDB with hybrid logical clocks and stable device IDs
- Content-only Deck Gift with digest validation, QR pairing, chunked WebRTC transfer, and local import/replacement
- Passphrase-protected trusted-device pairing and event-bundle exchange with AES-GCM
- Deterministic materialization of reviews, sessions, XP, deck edits, activation, imported decks, and difficulty
- Known-device verifier and passphrase check

Still proposed:
- Field-level conflict history UI and restore actions
- Coordinated all-device history reset and compaction
- Full fingerprint confirmation before trust (currently shown after pairing)
- One-time/multipart QR handling for unusually large ICE offers

## Goals

Opus Pusillium should support two intentionally different local-network workflows:

1. **Deck Gift** — send the current content of one deck to another learner. This is a one-time transfer and never includes learning progress.
2. **Trusted Device Sync** — pair two devices belonging to the same learner and repeatedly merge decks, review history, scheduling, XP, and session progress. This mode is passphrase-protected.

Both workflows must work without accounts or a cloud data service. Peers pair deliberately through QR codes and transfer data over an encrypted WebRTC data channel.

## Browser constraints

A PWA cannot listen as a LAN server or safely enumerate nearby browsers. `BroadcastChannel` is same-origin and same-device, and local-network HTTP discovery creates secure-context and certificate problems. Therefore:

- Peer discovery is explicit rather than automatic.
- WebRTC provides the encrypted peer-to-peer transport.
- QR codes carry the offer and answer required to establish a connection without an internet signaling service.
- Pairing uses a two-scan exchange: device A shows an offer; device B scans it and shows an answer; device A scans the answer.
- Offers/answers are compressed before encoding; animated multipart QR is the fallback when gathered ICE data exceeds one practical QR frame.
- Copy/paste and file exchange are fallback paths when a camera is unavailable.
- QR decoding should use a bundled cross-browser library rather than depend only on `BarcodeDetector`, particularly for Firefox.

WebRTC host candidates should connect devices on the same network. If network isolation, firewall rules, or incompatible ICE behavior prevent a direct route, the first release reports that clearly rather than sending data through an internet relay.

## User flows

### Deck Gift

**Sender**

1. Opens a deck in the Library workshop.
2. Selects **Share deck**.
3. The app creates a frozen content snapshot and a short-lived WebRTC offer.
4. The app displays the offer QR.
5. After scanning the recipient's answer QR, it sends the snapshot.
6. Both devices show the deck name, card count, digest, and completion status.

**Recipient**

1. Selects **Receive deck** in the Library.
2. Scans the offer QR.
3. Reviews deck name, description, source device, and card count.
4. Displays the answer QR.
5. Chooses **Import as copy** or, when matching provenance exists, **Replace previous gift**.

A gift contains only the current deck state. It creates no subscription, peer trust, or progress relationship.

### Trusted Device Sync

**First pairing**

1. Device A opens **Profile → Trusted devices → Add device**.
2. The learner chooses a strong sync passphrase and confirms which data categories are included.
3. Device A displays a short-lived offer QR.
4. Device B scans it, enters the same passphrase, and displays its answer QR.
5. Device A scans the answer.
6. Both devices verify a short human-readable fingerprint and store the trusted-device relationship.
7. Events missing on either side are exchanged, merged, and acknowledged.

**Later synchronization**

1. Either device selects the known peer and starts sync.
2. A fresh QR handshake establishes a new WebRTC channel.
3. Devices authenticate using their stored relationship key, unlocked by the passphrase.
4. They exchange only events after the last acknowledged cursor, then exchange digest summaries to verify convergence.

The passphrase is never transmitted. Forgetting a trusted device revokes its local relationship key. Because there is no central server, revocation takes effect on another offline device when that device next receives the revocation event from a still-trusted peer.

There is no account-based passphrase recovery. A learner who loses the passphrase must remove the relationship and pair the devices again; existing local decks and progress remain available.

## Data ownership

### Deck Gift payload

- Deck ID as source provenance
- Name, description, domain, and sigil
- Current non-deleted cards
- Schema version
- Snapshot creation time
- Content digest
- Optional author/device display name

Excluded:

- Review history
- Scheduling and due dates
- XP, level, streak, health, and Momentum
- Active-deck settings
- Device identity and event history

### Trusted Device Sync payload

- Deck content and edits
- Card additions, changes, restorations, and deletions
- Review events and derived scheduling state
- XP-producing events
- Session completion and streak events
- Active-deck selection
- Difficulty preference, if the learner enables preference sync
- Device membership and revocation events

Health and Momentum are transient session state and are not synchronized.

## Stable identity

Synchronization requires stable identifiers independent of array position:

```ts
type DeviceId = string;
type EventId = `${DeviceId}:${number}`;
type DeckId = string;
type CardId = string;
```

- Every device receives a random persistent `DeviceId`.
- Every locally created event increments that device's monotonic counter.
- Existing imported deck and card IDs remain stable.
- A Deck Gift imported as a copy receives a new local `DeckId`, while retaining `sourceDeckId` and `sourceDigest` as provenance.

## Event log

Trusted Device Sync exchanges immutable events rather than overwriting whole `localStorage` objects.

```ts
type SyncEvent = {
  id: EventId;
  deviceId: DeviceId;
  counter: number;
  clock: HybridTimestamp;
  entity: { kind: "deck" | "card" | "review" | "session" | "device"; id: string };
  operation: string;
  payload: unknown;
  previous?: EventId;
};

type HybridTimestamp = {
  wallTime: number;
  logical: number;
  deviceId: DeviceId;
};
```

Hybrid logical timestamps preserve the requested human timestamp while remaining deterministic when device clocks are wrong or equal. Ordering is `(wallTime, logical, deviceId, counter)`.

Initial event types:

- `deck.created`
- `deck.fieldChanged`
- `deck.deleted`
- `card.created`
- `card.fieldChanged`
- `card.deleted`
- `card.restored`
- `review.recorded`
- `session.completed`
- `deck.activationChanged`
- `preference.changed`
- `device.added`
- `device.revoked`

## Merge semantics

### Content

- Event sets merge by union on `EventId`.
- Independent changes to different fields apply automatically.
- Same-field changes resolve deterministically by hybrid timestamp.
- Losing same-field values remain in history and can be restored.
- A delete event is a tombstone and automatically hides the deck/card when it is newer than the last restore.
- A later explicit restore supersedes the tombstone.

### Reviews and progression

- Every review is a unique immutable event; concurrent offline reviews are both retained.
- Review events replay in deterministic hybrid-clock order to derive interval, ease, due date, rank, and failures.
- XP derives from review events rather than synchronizing a mutable total, preventing double-counting when the same event is received twice.
- Session and streak values similarly derive from unique completion events.

### History and compaction

- Event history and indexes live in IndexedDB; the existing `localStorage` state is migrated on first use.
- Materialized snapshots make normal app startup fast.
- Per-device vector cursors record which events each trusted peer acknowledged.
- Old events may be compacted only through a coordinated **history reset** in which all non-revoked trusted devices are reachable and acknowledge the same checkpoint.

#### Coordinated history reset

A learner may run **Sync all devices and compact history** when every trusted, non-revoked device is online. The devices do not need to open a permanent full mesh: one device may coordinate the temporary session and relay encrypted event batches, but every member must authenticate and participate.

1. The coordinator gathers each device's event vector and chooses a compaction frontier.
2. Devices exchange all missing events through that frontier.
3. Each device deterministically materializes the same decks, progress, XP, scheduling state, tombstones, and trusted-device membership.
4. The coordinator announces a barrier vector. Events created after the barrier remain in the new log and are never discarded by this reset.
5. Every device computes the canonical snapshot digest independently.
6. The reset proceeds only when every participating device reports the same digest and signs an acknowledgement containing the barrier vector and snapshot digest.
7. Each device atomically stores the snapshot and a compact `history.checkpoint` event before removing events covered by the barrier.
8. Devices exchange final checkpoint acknowledgements. The UI reports completion only after every device confirms durable storage.

If a device disconnects, fails authentication, has extra unshared events, computes a different digest, or cannot persist the snapshot, the reset aborts. Existing history remains untouched and ordinary synchronization can continue.

The checkpoint retains:

- Canonical materialized state
- Barrier/vector frontier
- Snapshot schema version and digest
- Participating device IDs and signatures
- Latest tombstones needed to prevent deleted content from reappearing
- Previous checkpoint digest, forming a small auditable checkpoint chain

Revoked devices are excluded from unanimity. A trusted device that was removed or factory-reset cannot later contribute pre-checkpoint events; it must pair again and bootstrap from the latest snapshot. New devices always bootstrap from the newest checkpoint plus subsequent events.

The app can suggest compaction after an event-count or storage-size threshold, but never deletes shared history automatically without a successful unanimous reset.

## Encryption and authentication

WebRTC already uses DTLS, but Trusted Device Sync adds application-layer protection:

1. Both sides generate ephemeral ECDH keys for each session.
2. The shared ECDH secret and passphrase-derived key are combined with HKDF.
3. The passphrase derivation uses a memory-hard KDF where browser support permits; PBKDF2 with a high work factor is the Web Crypto fallback.
4. Sync envelopes use AES-GCM with unique nonces and authenticated metadata.
5. Stored relationship keys are encrypted at rest by a passphrase-derived wrapping key.
6. Devices exchange and confirm a short fingerprint before becoming trusted.

Deck Gift uses WebRTC transport encryption plus an unguessable QR session secret. It does not create or retain a shared long-term key.

Pairing offers expire quickly and cannot be reused. All imports require explicit recipient confirmation.

## Wire protocol

```ts
type Envelope = {
  protocol: "opus-lan-sync";
  version: 1;
  mode: "deck-gift" | "device-sync";
  sessionId: string;
  sequence: number;
  kind: "hello" | "manifest" | "request" | "chunk" | "ack" | "complete" | "error";
  payload: Uint8Array;
  digest: string;
};
```

- Payloads use a versioned compact encoding.
- Large payloads are split into conservative chunks and honor data-channel buffered-amount backpressure.
- Every snapshot and event batch has a cryptographic digest.
- Transfers are resumable within the current pairing session.
- Unknown protocol/schema versions fail without changing local data.

## Storage changes

The current learner state remains a materialized view, but synchronization introduces IndexedDB stores:

- `events` — immutable events keyed by `EventId`
- `snapshots` — materialized deck/learner state
- `devices` — trusted peers, encrypted relationship keys, cursors, and revocation status
- `transfers` — temporary resumable transfer state
- `conflicts` — same-field merge history needing optional user review

`localStorage` remains suitable for non-sensitive UI preferences such as Library sorting.

## UI surfaces

### Library

- Add **Share** to the deck workshop.
- Add **Receive deck** beside Library sorting.
- Show an import preview before committing a gift.
- Show provenance in deck details without cluttering normal study UI.

### Profile

- Add **Trusted devices**.
- List device name, fingerprint, last sync, pending event count, and revoke action.
- Add **Sync now**, **Add device**, and a passphrase unlock dialog.

### Merge feedback

- Normal automatic merges show a concise summary: cards added, changed, and deleted; reviews merged; XP gained.
- A History screen can inspect prior field values and restore one as a new event.
- Transport or validation errors never partially apply data; batches commit atomically.

## Delivery phases

### Phase 0 — Synchronization-ready local model

- Introduce IndexedDB and migration from current `localStorage` progress.
- Add stable device identity, event IDs, hybrid clock, tombstones, and materialized views.
- Ensure existing study behavior remains unchanged.

### Phase 1 — Deck Gift

- Build snapshot/export/import format.
- Add two-QR WebRTC handshake and chunked data channel.
- Add Library sharing and import preview.
- No passphrase or persistent peer relationship yet.

### Phase 2 — Trusted Device Sync

- Add passphrase-protected device pairing and relationship keys.
- Synchronize append-only events and cursors.
- Merge review history and derive scheduling/XP deterministically.
- Add device management and revocation.

### Phase 3 — History and resilience

- Add conflict/history inspection and restore actions.
- Add coordinated all-device history reset, unanimous checkpoint acknowledgement, and safe event-log compaction.
- Add interrupted-transfer recovery and corruption simulations.

### Optional Phase 4 — LAN convenience service

- A separate local companion may advertise peers with mDNS and relay signaling only.
- QR pairing remains the universal privacy-preserving fallback.
- Deck/progress data remains peer-to-peer and end-to-end encrypted.

## Acceptance criteria

### Deck Gift

- Two offline devices on the same LAN transfer a 500-card deck without a cloud service.
- Recipient sees content preview and no learner progress is included.
- Cancelled or corrupted transfers leave local state unchanged.
- Re-import can create a separate copy or explicitly replace a prior gift.

### Trusted Device Sync

- Two devices independently edit different cards and converge after sync.
- Two devices edit the same field and deterministically converge while retaining history.
- Offline reviews on both devices merge without duplicate XP for duplicate events.
- Card/deck deletions propagate automatically through tombstones.
- A wrong passphrase reveals no sync content and creates no trusted relationship.
- Replaying a previously accepted batch is idempotent.
- Clock skew does not produce divergent results.
- Revoked devices cannot authenticate in a later pairing.
- When all non-revoked devices are online, a coordinated reset produces one identical checkpoint and removes covered history on every device.
- A disconnect, digest mismatch, persistence failure, or unshared post-barrier event aborts compaction without losing history.
- A newly paired device bootstraps from the latest checkpoint and subsequent events without requiring the discarded history.

## Tests

- Property tests: event-set merge is commutative, associative, and idempotent.
- Deterministic replay tests across random event orderings and clock skew.
- Migration tests from every supported local schema.
- Encryption tests for nonce uniqueness, wrong passphrase, tampering, and replay.
- WebRTC integration tests with chunk loss, backpressure, disconnect, and resume.
- Multi-device compaction tests covering unanimous success, disconnect at every protocol step, digest disagreement, concurrent post-barrier edits, atomic storage failure, and revoked-device exclusion.
- Playwright two-browser tests for gift, pairing, merge summary, history, and deletion propagation.
- Large-deck tests using the 496-card Norwegian data.

## Non-goals for the first release

- Internet/cloud synchronization
- Automatic discovery without pairing
- Collaborative real-time deck editing
- Public deck directories
- Multi-user permissions beyond Gift versus Trusted Device Sync
- Synchronizing transient health or Momentum
