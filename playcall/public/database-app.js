import { api, ensureSession } from "./api-client.js";

const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let room = null,
  inviteUrl = "",
  settings,
  timer,
  busy = false,
  screen = "lobby",
  offset = 0,
  lastView = "";
let messages = [],
  config;
const fragment = new URLSearchParams(location.hash.slice(1));
const suppliedInvite = fragment.get("invite") ?? "";
const toast = (text) => {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  setTimeout(() => {
    $("#toast").hidden = true;
  }, 5000);
};
function applySettings() {
  document.documentElement.dataset.theme =
    settings.theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : settings.theme;
  document.documentElement.dataset.reduceMotion = String(
    settings.reducedMotion,
  );
}
function shell(content) {
  $("#app").innerHTML =
    `<div class="shell"><header class="header"><a class="brand" href="/">PlayCall<span class="brand-dot">.</span></a><nav class="header-nav"><span class="tag">Text practice · progress saved</span><button class="nav-button" data-action="lobby" ${settings ? "" : "disabled"}>Lobby</button><button class="nav-button" data-action="account" ${settings ? "" : "disabled"}>Account & settings</button></nav></header><main id="main">${content}</main><footer class="footer"><span>Two people. A different point of view.</span><span>Microphone off · No AI processing</span></footer></div>`;
}
function showLobby() {
  screen = "lobby";
  clearTimeout(timer);
  shell(
    `<div class="lobby"><section class="lobby-copy"><p class="eyebrow blue">Meet someone. Become someone else.</p><h1>Two identities.<br>One unexpected deal.</h1><p class="lobby-intro">A private brief. Five minutes.<br>A different point of view.</p><div class="lobby-facts"><span>Two players</span><span>Private goals</span><span>Saved progress</span></div><div class="lobby-form"><h2>Enter the scene</h2><p class="footnote">Signed in as ${esc(settings.displayName)}. Your account name stays private.</p><button class="btn primary wide" data-action="create">Create private room →</button><div class="divider"></div><form id="join-form" class="stack"><label class="form-field" for="invite">Have an invite?<input id="invite" name="invite" value="${esc(suppliedInvite)}" placeholder="Paste your invite link or token" autocomplete="off" required></label><button class="btn secondary wide">Join room</button></form>${room ? '<button class="btn soft wide" data-action="resume">Return to current room</button>' : ""}<p class="footnote">${esc(config.notice)}</p></div></section><aside class="lobby-art"><div class="scenario-art db-art"><span class="eyebrow">Your first scene</span><span class="db-orbit">✦</span><span class="orbital-label">ONE SHIPMENT · TWO AGENDAS</span></div><div class="scenario-caption"><span class="eyebrow muted">Find the common ground.</span><h2>The Last Shipment</h2><p>A station needs supplies. A trader needs a deal. Negotiate price, delivery, and exclusivity.</p><div class="cast-row"><strong>Quartermaster</strong><span>↔</span><strong>Independent trader</strong></div></div><a class="demo-link" href="/?demo=1"><span><strong>Explore the original design demo</strong><small>Authored sample · separate from live rooms</small></span>→</a></aside></div>`,
  );
}
function clockText() {
  const deadline =
    room?.round?.state === "briefing"
      ? room.round.briefEndsAt
      : room?.round?.endsAt;
  if (!deadline || room.round.state === "completed") return "—:—";
  const seconds = Math.max(
    0,
    Math.ceil((deadline - Date.now() - offset) / 1000),
  );
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function showRoom(force = false) {
  screen = "room";
  const key = JSON.stringify([
    room.id,
    room.version,
    messages,
    settings.captions,
  ]);
  if (!force && lastView === key) return;
  lastView = key;
  const draft = new Map(
    [...document.querySelectorAll("#main input, #main select")].map((el) => [
      el.id,
      { value: el.value, checked: el.checked },
    ]),
  );
  const focusId = document.activeElement?.id;
  const selection = document.activeElement?.selectionStart;
  const self = room.members.find((m) => m.isYou),
    peer = room.members.find((m) => !m.isYou),
    round = room.round;
  const proposal = round?.proposal;
  const negotiating = round?.state === "negotiating";
  const complete = round?.state === "completed";
  const terms = proposal?.terms;
  shell(
    `<ol class="steps"><li class="step ${!round ? "active" : "done"}"><span>1</span>Get cast</li><li class="step ${round && !complete ? "active" : ""}"><span>2</span>Negotiate</li><li class="step ${complete ? "active" : ""}"><span>3</span>Debrief</li></ol><div class="room-top"><div><p class="eyebrow blue">${esc(room.scenario.source === "builtin" ? "Built-in practice scenario" : "Scenario")} · ${round ? `Round ${round.number}` : "Waiting room"}</p><h1>${esc(room.scenario.title)}</h1><p class="muted">${esc(room.scenario.description)}</p></div><div class="timer"><div class="time-digits" id="clock">${clockText()}</div><small>${round?.state === "briefing" ? "Read your private brief" : complete ? "Round complete" : negotiating ? "Time to make a deal" : "Invite a friend"}</small></div></div><div class="room-grid"><aside class="room-sidebar"><section class="participant you"><span class="eyebrow blue">You · ${esc(self.alias)}</span><p>${esc(round?.yourRole ?? "Ready to play")}</p></section><section class="participant other"><span class="eyebrow orange">${esc(peer?.alias ?? "Waiting for your partner")}</span><p>${peer ? "Connected to this room" : "Share the private invite"}</p></section>${!round ? `<section class="result-card"><h2>Invite your scene partner</h2>${inviteUrl ? `<label class="form-field" for="invite-link">Private invite link<input id="invite-link" value="${esc(inviteUrl)}" readonly></label><button class="btn secondary wide" data-action="copy">Copy invite</button>` : '<p class="footnote">Use the invite link you received when creating the room.</p>'}<p>${room.members.length}/2 players</p><button class="btn primary wide" data-action="ready" ${self.ready || !peer ? "disabled" : ""}>${self.ready ? "Waiting for partner…" : "I’m ready"}</button><p class="footnote">Both players must be ready. Then you have 45 seconds to read your briefs.</p></section>` : `<section class="result-card"><span class="private-note">PRIVATE BRIEF · ONLY YOU</span><h2>${esc(round.yourBrief.character)}</h2><p class="eyebrow">${esc(round.yourBrief.jobTitle)}</p><p>${esc(round.yourBrief.background)}</p><div class="notice">${esc(round.yourBrief.hardLimit)}</div><ol class="db-goals">${round.yourBrief.objectives.map((o) => `<li>${esc(o)}<small>100 mission points</small></li>`).join("")}</ol></section>`}</aside><section>${complete ? `<section class="result-card"><p class="eyebrow blue">The debrief</p><h2>${round.outcome === "agreement" ? "A deal worth talking about." : "No agreement this time."}</h2><div class="score-pair"><div><strong>You</strong><p class="score-number">${round.results.total}<small> / 300</small></p></div><div><strong>Your partner</strong><p class="score-number other">${round.results.opponentTotal}<small> / 300</small></p></div></div>${round.results.objectives.map((o) => `<div class="arithmetic"><div>${esc(o.description)}<small>${o.achieved ? "Confirmed terms met this goal." : "This goal was not met."}</small></div><b>+${o.points}</b></div>`).join("")}<div class="notice">AI coaching is unavailable in this text demo. Mission points are calculated by the server.</div><button class="btn primary" data-action="rematch" ${self.ready ? "disabled" : ""}>${self.ready ? "Rematch requested" : "Swap roles & rematch"}</button></section>` : ""}<section class="conversation"><div class="conversation-head"><h2>${negotiating ? "The conversation" : round ? "Read your brief" : "Your scene is almost ready"}</h2><span class="tag success">Progress saved</span></div><div id="messages" class="transcript" role="log" aria-label="Shared text conversation">${settings.captions ? messages.map((m) => `<article class="caption"><div class="caption-meta"><strong class="${m.seat === self.seat ? "" : "other"}">${m.seat === self.seat ? "You" : "Your partner"}</strong><em>typed text</em></div><p>${esc(m.text)}</p></article>`).join("") || '<p class="empty-copy">Every good deal starts with a question.</p>' : '<p class="empty-copy">Conversation hidden in your settings.</p>'}</div><form id="message-form" class="chat-form"><input id="message" aria-label="Your message" placeholder="Make an opening proposal…" maxlength="1000" required ${negotiating ? "" : "disabled"}><button class="btn primary" ${negotiating ? "" : "disabled"}>Send</button></form><div class="proposal-shelf">${proposal ? `<p class="eyebrow">Shared proposal · revision ${proposal.revision}</p><p class="proposal-price">${terms.priceCredits} credits</p><p>${terms.deliveryDays} day delivery · ${terms.exclusive ? "Exclusive" : "Non-exclusive"}</p><div class="acceptance">${room.members.map((m) => `<span>${m.isYou ? "You" : "Partner"}: ${proposal.acceptedSeats.includes(m.seat) ? "confirmed" : "pending"}</span>`).join("")}</div><button class="btn primary" data-action="accept" data-proposal="${proposal.id}" ${negotiating && !proposal.acceptedSeats.includes(self.seat) ? "" : "disabled"}>Confirm revision ${proposal.revision}</button>` : '<p class="proposal-idle">Turn the conversation into an offer.</p>'}</div>${negotiating ? `<form id="proposal-form" class="result-card db-terms"><h3>Propose terms</h3><label class="form-field" for="price">Price in credits<input id="price" type="number" min="1" max="1000" step="1" value="${terms?.priceCredits ?? 575}" required></label><label class="form-field" for="days">Delivery in days<input id="days" type="number" min="1" max="7" step="1" value="${terms?.deliveryDays ?? 3}" required></label><label class="consent"><input id="exclusive" type="checkbox" ${terms?.exclusive ? "checked" : ""}>Exclusive agreement</label><button class="btn secondary">Publish new proposal</button><p class="footnote">Publishing clears both confirmations. A deal requires both players to confirm the same revision.</p></form>` : ""}</section></section></div>`,
  );
  for (const [id, saved] of draft) {
    const el = document.getElementById(id);
    if (el && !el.readOnly) {
      el.value = saved.value;
      el.checked = saved.checked;
    }
  }
  const focused = document.getElementById(focusId);
  if (focused && !focused.disabled) {
    focused.focus({ preventScroll: true });
    if (focused.type === "text" && selection !== null)
      focused.setSelectionRange(selection, selection);
  }
  if (busy)
    document.querySelectorAll("#main button").forEach((button) => {
      button.disabled = true;
    });
}
async function refresh() {
  if (!room || screen !== "room") return;
  const requestedId = room.id;
  const [next, chat] = await Promise.all([
    api(`/api/rooms/${requestedId}`),
    api(`/api/rooms/${requestedId}/messages`),
  ]);
  if (
    screen !== "room" ||
    room.id !== requestedId ||
    next.version < room.version
  )
    return;
  room = next;
  messages = chat.messages;
  offset = room.serverTime - Date.now();
  showRoom();
}
function poll() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!document.hidden && screen === "room")
      try {
        await refresh();
      } catch (e) {
        toast(e.message);
      }
    if (screen === "room") poll();
  }, 1000);
}
async function enter(next, newInvite) {
  room = next;
  messages = [];
  lastView = "";
  offset = room.serverTime - Date.now();
  if (newInvite) {
    inviteUrl = newInvite;
    sessionStorage.setItem("playcall-db-invite", inviteUrl);
  }
  sessionStorage.setItem("playcall-db-room", room.id);
  history.replaceState(null, "", "/");
  await refreshRoom();
}
async function refreshRoom() {
  screen = "room";
  await refresh();
  poll();
}
async function command(value) {
  if (["consent", "ready", "rematch"].includes(value.type)) await refresh();
  try {
    room = await api(`/api/rooms/${room.id}/commands`, {
      expectedVersion: room.version,
      command: value,
    });
    lastView = "";
    await refreshRoom();
  } catch (e) {
    if (e.status === 409) await refreshRoom();
    throw e;
  }
}
async function showAccount() {
  screen = "account";
  clearTimeout(timer);
  const [saved, stats, history] = await Promise.all([
    api("/api/me/settings"),
    api("/api/me/stats"),
    api("/api/me/history"),
  ]);
  settings = saved;
  applySettings();
  shell(
    `<section class="results"><p class="eyebrow blue">Your private account</p><h1>Make yourself at home.</h1><p>${settings.guest ? "Guest account · create an account below to keep your progress across devices." : "Your profile and saved progress."}</p><div class="debrief-grid"><form id="settings-form" class="result-card stack"><h2>Settings</h2><label class="form-field" for="display-name">Private display name<input id="display-name" maxlength="40" value="${esc(settings.displayName)}" required></label><label class="form-field" for="theme">Appearance<select id="theme">${["system", "light", "dark"].map((t) => `<option ${settings.theme === t ? "selected" : ""}>${t}</option>`).join("")}</select></label><label class="consent"><input id="captions" type="checkbox" ${settings.captions ? "checked" : ""}>Show conversation text</label><label class="consent"><input id="motion" type="checkbox" ${settings.reducedMotion ? "checked" : ""}>Reduce motion</label><button class="btn primary">Save settings</button></form><section class="result-card"><h2>Your progress</h2><div class="coaching-row"><span>Completed rounds</span><strong>${stats.totalRounds}</strong></div><div class="coaching-row"><span>Mission XP</span><strong>${stats.xp}</strong></div><p class="footnote">Practice games do not change competitive rankings.</p><button class="btn secondary" data-action="logout">Sign out</button></section></div>${settings.guest ? `<form id="account-form" class="result-card stack"><h2>Keep your progress</h2><label class="form-field" for="email">Email<input id="email" type="email" autocomplete="email" required></label><label class="form-field" for="password">Password<input id="password" type="password" minlength="12" autocomplete="new-password" required></label><p class="footnote">At least 12 characters. Email verification and password-reset delivery are not configured for this local demo.</p><div class="row"><button class="btn primary" name="authAction" value="signup">Create account</button><button class="btn secondary" name="authAction" value="signin">Sign in</button></div></form>` : ""}<section class="result-card"><h2>Recent rooms</h2>${history.rooms.map((r) => `<div class="coaching-row"><span>${esc(r.title)}<small> · ${esc(r.state)}${r.points === null ? "" : ` · ${r.points} points`}</small></span><button class="text-button" data-action="history" data-room="${r.id}">Open room</button></div>`).join("") || "<p>Your first scene is waiting.</p>"}</section></section>`,
  );
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || busy) return;
  const action = button.dataset.action;
  busy = true;
  try {
    if (action === "create") {
      const created = await api("/api/rooms", {});
      await enter(
        created.room,
        `${location.origin}/#invite=${created.inviteToken}`,
      );
    } else if (action === "account") await showAccount();
    else if (action === "lobby") showLobby();
    else if (action === "resume") await refreshRoom();
    else if (action === "copy") {
      await navigator.clipboard.writeText(inviteUrl);
      toast("Invite copied.");
    } else if (action === "ready" || action === "rematch") {
      const self = room.members.find((m) => m.isYou);
      if (!self.consented) await command({ type: "consent", granted: true });
      await command({ type: action });
    } else if (action === "accept")
      await command({ type: "accept", proposalId: button.dataset.proposal });
    else if (action === "history")
      await enter(await api(`/api/rooms/${button.dataset.room}`));
    else if (action === "logout") {
      if (
        !confirm(
          "Sign out? An unlinked guest account cannot be recovered after signing out.",
        )
      )
        return;
      await api("/api/auth/sign-out", {});
      sessionStorage.removeItem("playcall-db-room");
      sessionStorage.removeItem("playcall-db-invite");
      location.reload();
    }
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
    if (screen === "room") showRoom(true);
  }
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  try {
    if (event.target.id === "join-form") {
      let inviteToken = $("#invite").value.trim();
      if (inviteToken.includes("://"))
        inviteToken =
          new URLSearchParams(new URL(inviteToken).hash.slice(1)).get(
            "invite",
          ) ?? "";
      await enter(await api("/api/rooms/join", { inviteToken }));
    } else if (event.target.id === "proposal-form")
      await command({
        type: "propose",
        terms: {
          priceCredits: Number($("#price").value),
          deliveryDays: Number($("#days").value),
          exclusive: $("#exclusive").checked,
        },
      });
    else if (event.target.id === "message-form") {
      await api(`/api/rooms/${room.id}/messages`, {
        text: $("#message").value,
      });
      $("#message").value = "";
      await refreshRoom();
    } else if (event.target.id === "account-form") {
      const signup = event.submitter?.value !== "signin";
      await api(`/api/auth/${signup ? "sign-up" : "sign-in"}/email`, {
        email: $("#email").value,
        password: $("#password").value,
        ...(signup ? { name: settings.displayName } : {}),
      });
      await showAccount();
      toast(signup ? "Account created. Your progress is saved." : "Signed in.");
    } else if (event.target.id === "settings-form") {
      settings = await api(
        "/api/me/settings",
        {
          displayName: $("#display-name").value,
          theme: $("#theme").value,
          captions: $("#captions").checked,
          reducedMotion: $("#motion").checked,
        },
        "PATCH",
      );
      applySettings();
      toast("Settings saved.");
    }
  } catch (e) {
    toast(e.message);
  } finally {
    busy = false;
    if (screen === "room") showRoom(true);
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && screen === "room")
    void refresh().catch((e) => toast(e.message));
});
setInterval(() => {
  if ($("#clock")) $("#clock").textContent = clockText();
}, 250);
async function boot() {
  shell(
    '<section class="incomplete"><h1>Setting the scene…</h1><p>Connecting your private session.</p></section>',
  );
  try {
    await ensureSession();
    [settings, config] = await Promise.all([
      api("/api/me/settings"),
      api("/api/config"),
    ]);
    applySettings();
    const savedRoom = sessionStorage.getItem("playcall-db-room");
    inviteUrl = sessionStorage.getItem("playcall-db-invite") ?? "";
    if (savedRoom && !suppliedInvite)
      try {
        await enter(await api(`/api/rooms/${savedRoom}`));
        return;
      } catch {
        sessionStorage.removeItem("playcall-db-room");
      }
    showLobby();
  } catch (e) {
    shell(
      `<section class="incomplete"><h1>We couldn’t set the scene.</h1><p>${esc(e.message)}</p><a class="btn primary" href="/">Try again</a></section>`,
    );
  }
}
await boot();
