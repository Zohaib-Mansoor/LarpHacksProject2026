# Public references and screenshots

Captured and inspected November 1, 2026, following the request to search online, use the iOS design skill, and take screenshots. These are the actual public pages viewed in the browser. The screenshots are design-study artifacts, not assets reused inside RoleCall.

| Source | Observed in the captured screen | Adaptation to RoleCall | Limit |
| --- | --- | --- | --- |
| [Whereby Meetings](https://whereby.com/information/meetings) | A two-person call preview beside the proposition; a compact row of call controls below the people | Keep people and conversation close, and group call controls into a distinct dock | Its video tiles and branding are not carried into this voice-only game. A screenshot does not prove its live interaction timing. |
| [Linear](https://linear.app/) | The public interactive app preview has quiet left navigation, a central activity thread, and a narrower contextual pane | Reduce room chrome, keep the transcript central, separate private context from shared actions | Product-development navigation is not suitable for RoleCall; only its hierarchy is relevant. |
| [Apple: Designing for iOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios) | System typography, sparse chrome and an iPhone illustration; the guidance explicitly covers primary-task focus, appearance adaptation, and reachable controls | Use system font fallbacks, grouped selectors, light/dark appearance, and a bottom call dock on narrow screens | This remains a responsive web app. No native iOS performance, platform integration, or frame-rate claim is made. |
| [Apple: FaceTime audio settings](https://support.apple.com/en-ie/guide/iphone/iphb54d5dee2/ios) | An iPhone Control Center illustration groups audio choices and marks the selected option inside a rounded panel | Group secondary controls and use both visible labels and selected-state styling; use a bottom proposal sheet on phones | No voice-isolation selector, Liquid Glass material, recording, or FaceTime feature is represented as implemented. The proposal sheet is our design proposal. |

Local screenshots are in `artifacts/references/`: `whereby-meetings.jpg`, `linear-desktop.jpg`, `linear-interface.jpg`, `apple-ios-guidelines.jpg`, and `apple-audio-controls.jpg`. `reference-sheet.jpg` combines four captures with source labels. `artifacts/` is ignored by Git; the screenshot sheet is delivered separately in the chat.

## Changes from this pass

- Replaced the accented “plot twist” headline with a plain, two-line statement about the actual negotiation.
- Replaced lobby underline tabs with a grouped segmented selector.
- Reduced the participant-panel border hierarchy, kept fictional audio avatars circular, and enlarged conversation text.
- Grouped mute, captions, report and leave into a labelled dock; on phones it remains at the bottom with safe-area spacing and reserved content clearance.
- Made the proposal a bottom sheet on narrow screens. Added a wrapping exact-terms summary so truncated native select labels cannot hide a delivery obligation.
- Added light and dark appearance, readable semantic token pairs, system typography and reduced-motion support.

These are reference-informed design decisions, not evidence of improved retention or conversion. A playtest is still needed to establish whether players prefer them.
