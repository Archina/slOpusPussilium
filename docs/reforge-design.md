# Card Reforge design

## Summary

Reforge turns a card that is currently too broad or advanced into a short sequence of smaller cards. Repeated `Again` answers earn a persistent currency, provisionally called **Embers**. A separate per-card **strain** score identifies which card is causing trouble. Once a card is strained and the learner has enough Embers, they can open a guided editor, create two or more replacement cards manually or with an AI proposal, review the result, and commit it as one reversible operation.

The feature should reward the learner for identifying a mismatch in the material. It must not frame difficulty as punishment or let AI-generated content alter a deck without review.

## Goals

- Detect cards that are difficult *now*, rather than relying only on lifetime failures.
- Preserve earned Reforge currency across retries, sessions, reloads, and trusted-device sync.
- Let a learner split one card into several smaller, independently reviewable cards.
- Keep the original card and its review history available for lineage and undo.
- Support manual use fully offline.
- Offer optional, provider-neutral AI assistance without requiring an Opus Pusillium account or hosted AI service.

## Non-goals

- Automatically rewriting a card after a fixed number of failures.
- Treating every difficult card as badly authored. Some cards should remain difficult.
- Generating an entire deck without learner review.
- Sending deck content or provider credentials through the LAN sync channel.
- Replacing the existing deck editor; Reforge is a focused workflow with provenance and progression rules.

## Learning model

### Two independent values

Do not use one counter for both eligibility and payment:

1. **Embers** are a learner-wide, persistent wallet. Every `Again` review earns one Ember. Requeueing the card does not clear it. Embers are not awarded for `Hard`, because `Hard` still means the learner recalled the answer.
2. **Strain** belongs to a card and represents recent difficulty. It determines whether that card should be suggested for Reforge.

The existing `failures` field remains a lifetime statistic used for card rank and XP. It should not be repurposed as strain because it never recovers after later mastery.

Recommended initial rules:

| Review | Ember change | Card strain change |
| --- | ---: | ---: |
| Again | +1 | +1 |
| Hard | 0 | unchanged |
| Good | 0 | -1, minimum 0 |
| Easy | 0 | reset to 0 |

- A card is **strained** at 3 strain.
- Reforge initially costs **3 Embers**, regardless of the number of replacement cards.
- The cost is charged only when the learner commits the replacement, not when opening the wizard or asking an AI for a proposal.
- Values must be named constants and tuned from observed behavior rather than embedded in UI components.

This lets three failed attempts during one session reveal an oversized card, while successful recall naturally clears false positives. The wallet remains earned even when strain later falls.

### Flag behavior

Crossing the threshold creates a non-blocking suggestion. It must not interrupt the current review or remove the card from the active queue.

- Show a quiet `Ready to reforge` treatment on the card after grading.
- Offer `Reforge after session`; selecting it adds the card to a workshop queue.
- Show strained cards in a `Needs attention` section of the deck workshop.
- Let the learner dismiss a suggestion. Dismissal hides the prompt until strain increases again; it does not alter review history or Embers.
- Always allow manual deck editing. Reforge itself requires both a strained source card and sufficient Embers so the progression mechanic remains meaningful.

### Visual strain: cracking cards

Make strain visible on the physical card by progressively cracking its surface. This gives repeated difficulty an immediate thematic meaning: the card is becoming unsuitable in its current form and is ready to be reforged.

Recommended states:

| Strain | Treatment |
| ---: | --- |
| 0 | Intact card |
| 1 | One subtle hairline crack from an edge |
| 2 | A second branch and a slightly wider first crack |
| 3 | A clear connected fracture with a faint Ember glow; `Ready to reforge` |
| 4+ | Additional branches or stronger glow, capped so the card remains readable |

- On `Again`, briefly animate the new fracture spreading from its previous endpoint and show `+1 Ember` beside it.
- On `Good`, one crack level recedes with strain. On `Easy`, the surface returns to intact. The earned Ember remains in the wallet.
- `Hard` leaves the current crack state unchanged.
- Cracks must never cross the text at enough opacity to reduce readability. Render them as a decorative surface layer beneath text and above the card texture.
- Show the same strain treatment on both faces so flipping the card does not make the feedback disappear.
- Keep rank ornamentation and strain visually distinct: rank represents long-term persistence, while cracks represent current mismatch.
- Use three or four authored SVG crack stages rather than generating arbitrary geometry at runtime. A deterministic transform derived from the card ID can mirror or slightly rotate them for variety without changing across reloads or devices.
- Cap visual intensity after the Reforge threshold. More failures may strengthen the edge glow, but must not make the learner's material look destroyed or illegible.

The Reforge transition can complete the metaphor: the retired card separates along its cracks, the pieces draw into a forge glow, and the replacement cards emerge. This is celebratory feedback after commit, not a destructive animation shown on every failure.

Cracking is supplementary feedback. The card status must also be available as text and an accessible label such as `Strain 2 of 3 · one more Again makes this card ready to reforge`. Reduced-motion mode displays the next static crack stage without spreading, shaking, flashing, or shattering animation.

## Reforge wizard

Use a focused modal or full-screen wizard launched from the study-completion screen or deck workshop.

### 1. Inspect

Show the source card front and back, recent rating pattern, strain, current Ember balance, and Reforge cost. Explain: “This card may contain more than one step. Break it into smaller ideas.”

Actions:

- `Split it myself`
- `Suggest with AI` when a provider is configured
- `Keep studying`

### 2. Draft

Start with two blank replacement rows. Each row has front, back, drag ordering, duplicate, and remove controls. Permit 2–8 cards, while recommending 2–5.

The source card remains visible beside or above the draft. The learner may add context for AI generation, but that context is not saved unless explicitly requested.

### 3. Check

Run deterministic local validation:

- every front and back is non-empty;
- at least two replacement cards exist;
- no exact duplicate fronts;
- no replacement is identical to the source card;
- IDs are newly generated and stable;
- warn, but do not block, on very long fronts/backs or near-duplicate cards.

Present a diff-like summary: one source card is retired, and N new unseen cards are inserted at its former position.

### 4. Commit

The final button states the cost: `Spend 3 Embers · Reforge into 4 cards`.

Commit as one domain transaction:

- retire, but do not erase, the source card;
- insert replacements at the source card's deck position;
- start each replacement as unseen with fresh scheduling progress;
- record lineage from each replacement to the source and Reforge operation;
- deduct Embers;
- remove the source from future sessions, including bonus-card selection;
- leave the already-running study queue unchanged until it closes.

The result screen offers `Study new cards` and `Return to workshop`.

### Undo

Allow lossless undo while none of the replacement cards has review history. Undo retires the replacements, restores the source, and refunds the exact Reforge spend. Once a replacement has been reviewed, offer a history/restore workflow instead of simple undo so review events are never silently orphaned.

## Data model

Names are illustrative; the important distinction is between authored card content, scheduling progress, and immutable lineage.

```ts
type LearnerState = {
  // existing fields
  embers: number;
  cardAdaptation: Record<string, CardAdaptation>;
  reforges: Record<string, ReforgeRecord>;
};

type CardAdaptation = {
  strain: number;
  suggestionDismissedAtStrain?: number;
};

type ReforgeRecord = {
  id: string;
  deckId: string;
  sourceCardId: string;
  replacementCardIds: string[];
  cost: number;
  createdAt: number;
  method: "manual" | "ai-assisted";
  providerId?: string; // provider identity only; never credentials or raw response
  undoneAt?: number;
};

type CardLineage = {
  sourceCardId: string;
  reforgeId: string;
};
```

In the current materialized `DeckEdit.questions` representation, retirement appears as removing the source from the visible array and adding new cards. The event log/history must retain the source snapshot. Longer term, explicit active/retired card records are preferable to treating array absence as deletion.

Loading older local state must default `embers`, `cardAdaptation`, and `reforges` without invalidating version-1 data. The active sync work should own the final migration/version strategy.

## Events and synchronization

Embers and Reforge must be deterministic under event replay rather than synchronized as mutable totals.

Recommended event additions:

```ts
review.recorded      // existing; Again derives +1 Ember and strain changes
reforge.committed    // source snapshot, ordered replacements, cost, method, lineage
reforge.undone       // references the committed Reforge
reforge.dismissed    // source card and strain at dismissal
```

`reforge.committed` is a single compound event, not a sequence of card delete/create events. Its materializer atomically retires the source, creates every replacement, and records the spend. This prevents another device from showing half a split. Fine-grained card edits after commit continue to use normal card events.

Replay derives:

- wallet balance from Ember-earning reviews minus accepted Reforge spends and plus accepted undo refunds;
- strain from the ordered review stream;
- active card content from accepted Reforge and card-edit events.

Concurrent offline Reforges of the same source card cannot both become active. Resolve them deterministically by the existing hybrid event order, preserve the losing proposal in sync conflicts, and let the learner merge or discard it. Concurrent wallet spending can also exceed the shared balance. The materializer must deterministically accept spends in event order and surface later unaffordable operations as conflicts rather than producing a negative balance. A future per-device Ember escrow can remove this offline double-spend edge case if it becomes common.

Deck Gifts include only current active card content. They may optionally include non-sensitive lineage, but never review history, strain, wallet balance, AI settings, prompts, responses, or credentials.

## AI assistance

### Provider boundary

AI is an optional proposal source behind a small interface; the wizard does not know provider-specific APIs.

```ts
type ReforgeRequest = {
  source: { prompt: string; answer: string };
  deck: { name: string; domain: string };
  learnerContext?: string;
  minCards: number;
  maxCards: number;
};

type ReforgeProposal = {
  cards: Array<{ prompt: string; answer: string }>;
  rationale?: string;
};

interface ReforgeProvider {
  id: string;
  generate(request: ReforgeRequest, signal: AbortSignal): Promise<ReforgeProposal>;
}
```

Initial adapters should cover:

- an OpenAI-compatible HTTP endpoint, which also supports many local gateways;
- local OpenAI-compatible servers such as Ollama or LM Studio where configured;
- provider-specific adapters only when their request/auth/structured-output behavior differs enough to require one.

This follows the provider pattern used by tools such as OpenCode, but Opus Pusillium should not depend on OpenCode or assume it is an AI gateway.

### Browser constraints and credentials

- Manual Reforge remains fully offline and is the primary path.
- Direct browser requests work only when the provider permits CORS. Explain connection failures clearly.
- Offer an optional localhost companion/gateway later for providers that reject browser requests. Do not silently proxy through an Opus service.
- Prefer session-only API keys. If the learner opts to remember a key, store it device-locally and warn that a browser application cannot make a long-lived key completely secret from scripts running in the same origin.
- Never place keys in `LearnerState`, sync events, Deck Gifts, diagnostics, or exported settings.
- AI configuration is device-local; sync only a harmless provider preference if explicitly enabled.

### Safe generation flow

- Send only the source card, deck name/domain, optional learner-written context, and generation constraints by default.
- Require an explicit opt-in before sending neighboring cards or deck descriptions.
- Treat source text as untrusted data, not instructions. Providers receive no tools and no application capabilities.
- Request structured JSON when supported; parse into an unknown value, validate size and strings, then convert to `ReforgeProposal`.
- Never apply a response directly. Populate an editable draft and require local validation plus explicit commit.
- Show which provider/model produced the proposal. Do not save hidden reasoning or the raw provider response.
- AI request/token cost is separate from Embers. Failed or cancelled requests spend no Embers.

Suggested generation instruction: preserve the source fact, identify prerequisite concepts, produce atomic cards answerable independently, avoid introducing unsupported facts, and use the source language unless asked otherwise.

## Accessibility and tone

- Use “This card may be too broad” rather than “You failed this card.”
- Currency gain should be visible but restrained: `+1 Ember · Reforge progress saved`.
- Do not rely on color or animation to indicate strain or AI loading.
- The complete manual flow must support keyboard navigation, screen readers, cancellation, and draft recovery.
- Reduced-motion mode should skip forge/fragment animations.

## Delivery plan

### Phase 1 — local learning signal

- Add persistent Embers and per-card strain.
- Derive both in the review path and expose strained-card indicators.
- Add accessible static crack stages and the reduced-motion behavior.
- Add unit tests for rating transitions, reload persistence, and repeated `Again` requeue behavior.

### Phase 2 — manual Reforge

- Build the inspect/draft/check/commit wizard.
- Add atomic Reforge command, lineage, retirement, and constrained undo.
- Test scheduling, active-session behavior, deck position, validation, and progress isolation.

### Phase 3 — sync integration

- Add compound Reforge events and deterministic materialization.
- Test idempotent replay, concurrent same-source Reforges, wallet overspend conflicts, undo, checkpoint compaction, and Deck Gift exclusion rules.

### Phase 4 — AI providers

- Add provider settings and the provider-neutral interface.
- Implement one OpenAI-compatible adapter first.
- Add schema validation, cancellation, timeout/error UX, privacy disclosure, and mocked-provider browser tests.

## Product decisions to validate

The recommended defaults are 1 Ember per `Again`, strain at 3, and a cost of 3 Embers. Before polishing the economy, validate:

- whether repeated retries in one session should each earn an Ember;
- whether `Hard` should add partial strain while still earning no currency;
- whether learners prefer a global wallet or Embers bound to the troublesome card;
- whether learners expect cracks to heal with strain or prefer a lasting visual history;
- whether source retirement should happen immediately or after the learner completes one successful pass through the replacements;
- whether AI-generated rationale is useful enough to display or merely adds noise.
