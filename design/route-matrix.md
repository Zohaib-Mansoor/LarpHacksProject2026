# Route and state matrix

| Route | Task | Required states |
| --- | --- | --- |
| / | Understand and start | guest, signed-in, narrow, dark |
| /login | Sign in | empty, pending, invalid credentials, age gate refused, provider unavailable |
| /signup | Create account | empty, field errors, under 13, consent missing, success |
| /play | Create or join | auth required, room-code validation, waiting, provider availability |
| /room/:code | Prepare and call | assigned brief, both-ready, connected, muted, brief drawer, captions/chat drawer, offer drawer, pending acceptance, changed revision, timeout, disconnect, leave/report |
| /results/:code | Inspect outcome | confirmed, no deal, incomplete, coaching unavailable, mutual goal reveal, rematch |
| /leaderboard | See opt-in mission standings | empty, ranked users, opted-out current user, unavailable |
| /account | Manage account | signed-in, guest redirect, profile update, ranking opt-in, logout, delete confirmation |
| /privacy | Understand processing | actual storage, voice, retention, rights/contact limitations |
| /terms | Understand rules | 13+ eligibility, fictional negotiation, conduct, limitations |

All routes: browser back/forward, direct navigation, keyboard focus, 320/768/1440px, long labels, server errors, no overflow. Existing authored demo remains clearly labelled. Planned routes are not claimed to exist before implementation.
