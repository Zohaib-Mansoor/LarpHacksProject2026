import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import {
  getProfile,
  getRoundHistory,
  persistProfile,
  syncAccount,
} from "../lib/api";
import { useToast } from "../providers/ToastProvider";
import { useSession } from "../providers/SessionProvider";

export default function Account() {
  const { toast } = useToast();
  const { user } = useSession();
  const [profile, setProfile] = useState(() => getProfile());
  const [callsign, setCallsign] = useState(profile.callsign);
  const [optIn, setOptIn] = useState(profile.leaderboardOptIn);
  const [history, setHistory] = useState(getRoundHistory);
  useEffect(() => { let active = true; void syncAccount().then(() => { if (active) setHistory(getRoundHistory()); }).catch(() => {}); return () => { active = false; }; }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    let updated;
    try {
      updated = await persistProfile({
        callsign: callsign.trim(),
        leaderboardOptIn: optIn,
        ageConfirmed: true,
      });
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Unable to save preferences.",
      );
      return;
    }
    setProfile(updated);
    toast("Caller preferences saved.");
  }

  async function clearHistory() {
    await syncAccount();
    toast("Saved round history refreshed.");
    window.location.reload();
  }

  return (
    <AppShell>
      <div className="hub" style={{ maxWidth: 640 }}>
        <header className="hub-header">
          <div className="hub-balance-label">Saved caller preferences</div>
          <h1 className="hub-balance">Caller Profile</h1>
          <p style={{ color: "var(--muted)", marginTop: 6 }}>
            In rooms, partners only ever see your server-assigned scenario alias
            — never this callsign.
          </p>
        </header>
        {user?.isGuest ? (
          <section className="standings-card" style={{ padding: 24, marginBottom: 20 }}>
            <h2>You’re playing as a guest</h2>
            <p>Create an account to keep this guest session’s saved progress, or sign in to an existing account.</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
              <Link to="/signup" className="wise-pill wise-pill-solid">Create account</Link>
              <Link to="/login" className="wise-pill wise-pill-soft">Sign in</Link>
            </div>
          </section>
        ) : null}

        <form
          className="standings-card"
          style={{ padding: 24, display: "grid", gap: 18 }}
          onSubmit={onSave}
        >
          <div className="flow-input-block" style={{ margin: 0 }}>
            <label htmlFor="acc-callsign">Public standings callsign</label>
            <input
              id="acc-callsign"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value.slice(0, 24))}
              placeholder="Your username"
            />
          </div>

          <label className="flow-consent" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={optIn}
              onChange={(e) => setOptIn(e.target.checked)}
            />
            <span>
              Automatically submit verified mission points to the session
              leaderboard after completed rounds.
            </span>
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" className="wise-pill wise-pill-solid">
              Save preferences
            </button>
            <Link to="/privacy" className="wise-pill wise-pill-soft">
              Privacy policy
            </Link>
            {history.length > 0 ? (
              <button
                type="button"
                className="wise-pill wise-pill-danger"
                onClick={clearHistory}
              >
                Refresh {history.length} saved{" "}
                {history.length === 1 ? "round" : "rounds"}
              </button>
            ) : null}
            <button
              type="button"
              className="wise-pill wise-pill-soft"
              onClick={async () => {
                await fetch("/api/auth/sign-out", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                localStorage.removeItem("playcall-round-history");
                localStorage.removeItem("playcall-local-profile");
                sessionStorage.removeItem("playcall-room-tokens");
                window.location.assign("/login");
              }}
            >
              Sign out
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
