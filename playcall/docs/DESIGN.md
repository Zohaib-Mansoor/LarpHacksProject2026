# Design direction

## Product contract

Help two people inhabit different fictional agendas, discover a compromise, and inspect the consequences of the same signed deal. Keep the original blue/white identity, orange partner, voice-only participant layout, private objectives, exact scoring, and five-minute format.

## Directions considered

1. **Negotiation table — selected.** Compact participant panels, an open conversation surface, and a shared agreement shelf. The private dossier is visually separate. The signed deal becomes a dark receipt above the result arithmetic.
2. Casting studio. Large theatrical identity cards and a reveal-led entry. Stronger character emphasis, but the cards would compete with the conversation during play.
3. Minimal messenger. Familiar chat bubbles and a composer. Fast to understand, but the shared proposal could disappear into the message history.

These are design judgments, not observed user research or validated conversion effects.

## Visual system

- Quiet cool page, opaque white work surfaces, blue main action, warm orange partner, restrained green confirmation. No gradients or continuously animated decorative waves.
- System sans to avoid third-party font requests. Large, close-set lobby type; compact names and speech labels; tabular timer, contract values, and mission totals.
- Spacing in 4/8-pixel increments, 8-pixel controls, 12–14-pixel room panels, sparse borders and nearly no shadows. The custom SVG satellite provides one product-specific illustration; geometric person marks keep identities fictional.
- The main action changes with the phase: create/join, ready, propose, confirm, inspect result, rematch. Proposal edits publish a new revision and clear both signatures.
- Motion: 230 ms opacity/5-pixel arrival for phase changes; 160 ms control feedback. Reduced-motion removes nonessential animation and transitions. Nothing waits for animation completion.
- Mobile: two participant strips, collapsed private brief, conversation, then proposal and call controls. All information reflows; essential controls stay outside the dossier.
- Native dialogs, visible focus, labelled fields, no hover-only actions, escaped player text, colour plus names/status words, and a skip link.

## Mobbin status

The Mobbin skills were read, and a focused search for an audio call screen with a transcript was attempted. The MCP returned: “Mobbin MCP requires a paid plan.” No reference screens were returned or inspected. No Mobbin pattern or precedent is claimed. The redesign uses the supplied baseline and plan, UI/UX Pro Max guidance, and Creative Motion Design judgment.

The UI/UX Pro Max design-system search returned a minimal/Swiss direction and Outfit/Work Sans typography. Its red recording palette and marketing-page section pattern did not fit the user’s fixed blue identity or in-room task, so those recommendations were not applied. The system font, blue and orange semantics, restrained surfaces, and motion remain grounded in the original product brief.

## Public-reference and iOS refinement

The subsequent pass uses the Apple UI Design and Frontend Design skills with actual browser captures of Whereby Meetings, Linear’s public app preview, Apple’s iOS guidance, and Apple’s FaceTime audio settings. [The reference ledger](REFERENCES.md) records exact source links, observed patterns, adaptations, and limits. This adds a segmented room selector, system font fallbacks, a labelled mobile bottom dock, a bottom proposal sheet, a wrapping exact-terms summary, and light/dark appearance. The room phase does not use the entrance transform, so the fixed mobile dock is not temporarily anchored to an animated ancestor.

## Privacy-aware content

No “fully anonymous” claim, fabricated live participant, unlabelled sample evaluation, or invented provider retention promise. Text practice is clearly separate from speech. The authored demo is always labelled and never captures media. Its reveal and partner-confirmation actions explicitly say they simulate the other person.
