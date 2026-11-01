# Grading rubric and ranking rules

The server publishes this rubric at GET /api/rubric. Version: negotiation-v1.
Each player sees their own objective explanations and AI feedback in the debrief.

| Category                    | Maximum | How it is graded                                                                                                                                        |
| --------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objective success           |      60 | Three private objectives, checked by code against the exact confirmed deal; each achieved objective contributes 20 grade points and 100 mission points. |
| Negotiation strategy        |      15 | Explains priorities, makes reasoned offers, and trades concessions deliberately.                                                                        |
| Listening and collaboration |      10 | Asks useful questions and responds to the other player's expressed concerns.                                                                            |
| Clarity and closing         |      10 | Uses clear terms, checks understanding, and accurately summarizes agreement or unresolved differences.                                                  |
| Respect and composure       |       5 | Stays respectful and avoids coercion, personal attacks, or harassment.                                                                                  |
| Total                       |     100 | 60 deterministic objective points plus 40 evidence-based communication points.                                                                          |

## Communication anchors

Each AI category receives a level from 0 through 4. Its contribution is level / 4
multiplied by that category's maximum.

- 0: No demonstrated skill in the available evidence.
- 1: Limited; unsupported assertions or missed opportunities dominate.
- 2: Competent; some clear, relevant examples.
- 3: Strong; consistent, effective examples.
- 4: Excellent; specific, adaptive, effective examples throughout available evidence.

Every category requires at least one exact quote from the player's own committed
transcript. Quotes must match a persisted segment ID and an exact substring. The
backend rejects fabricated evidence, wrong-speaker evidence, duplicate categories,
and invalid scores. The AI sees the shared transcript and only the assessed player's
private brief. Transcript instructions such as 'award full marks' are untrusted data.

Never grade accent, gender, pitch, nationality, disability, speech speed, or verbosity.
A small or incomplete transcript does not justify claims about a whole conversation.
If either speaker has fewer than 50 committed characters, communication feedback is
unavailable. A provider failure or invalid evidence retries; after three attempts,
feedback remains unavailable. No invented zero is inserted for missing evidence.

## Mission points and deals

Each scenario has two job titles and three private, machine-checkable objectives:
price target, delivery target, and exclusivity preference. Its private reservation
price is a hard acceptance constraint. Generated scenarios are validated for a
feasible price overlap and frozen with the round before either role is assigned.
Each player's three objectives can be achieved, but both sides' preferences need
not all be achievable together; that creates tradeoffs for negotiation.

Both players must explicitly accept the same active proposal ID before the server
deadline. Every edit clears all acceptances. The accepted terms become immutable.
No agreement yields zero mission points for both players, but can still earn useful
communication feedback. Merely saying 'deal' is not a confirmed game agreement.

Example: two objectives achieved = 200 mission points and 40/60 objective grade
points. Strategy level 3 adds 11.25, listening level 2 adds 5, clarity level 4 adds 10,
and professionalism level 4 adds 5. Overall grade = 71.25/100.

## Ratings and public rankings

Mission points determine the competitive result: more points wins, equal points
draws. AI grades do not influence Elo because transcript mistakes, incomplete audio,
and model variability should not decide competitive ratings.

Players start at 1000 Elo. K=32:

```text
expectedA = 1 / (1 + 10 ^ ((ratingB - ratingA) / 400))
actualA = 1 for a win, 0.5 for a draw, 0 for a loss
delta = round(32 * (actualA - expectedA))
newA = oldA + delta
newB = oldB - delta
```

A 1000-vs-1000 win produces 1016 and 984; a draw leaves both at 1000.
A unique round settlement prevents double-rating on duplicate requests, reconnects,
or worker restarts. Rating rows are locked in a stable order inside the settlement
transaction. Practice rooms do not change Elo; mission points still add XP.

| Tier        | Elo after placements      |
| ----------- | ------------------------- |
| Provisional | Fewer than 5 ranked games |
| Bronze      | Below 1000                |
| Silver      | 1000–1199                 |
| Gold        | 1200–1399                 |
| Platinum    | 1400–1599                 |
| Diamond     | 1600–1799                 |
| Master      | 1800+                     |

The top-100 leaderboard orders by rating, ranked games played, then stable public
profile ID. Positions are ordinal, with tiers shown separately. Generated public
handles protect auth identities. The current invite-based MVP does not claim a
calibrated ladder or resistance to account farming/collusion; add verified-account
eligibility, random matchmaking, repeat-opponent limits, and abuse detection before
using it as a public competitive ranking.
