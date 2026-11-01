import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { syncAccount } from "../lib/api";
import { useSession } from "../providers/SessionProvider";
export default function Signup() {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [eligible, setEligible] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useSession();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!eligible) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.message || "Unable to create account.");
      await syncAccount();
      await refresh();
      navigate("/play");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create account.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <p className="kicker mono">CREATE CALLER ACCOUNT</p>
        <h1 className="display auth-title">Keep your progress</h1>
        <p className="auth-sub">
          Your email stays private. Other players see your username.
        </p>
        <label className="flow-input-block">
          Username
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
        </label>
        <label className="flow-input-block">
          Email
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="flow-input-block">
          Password
          <input
            type="password"
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label className="flow-consent">
          <input
            type="checkbox"
            checked={eligible}
            onChange={(e) => setEligible(e.target.checked)}
            required
          />
          <span>
            I am 13 or older and accept the <Link to="/terms">Terms</Link> and{" "}
            <Link to="/privacy">Privacy Policy</Link>.
          </span>
        </label>
        <p className="auth-foot">
          Use at least 12 characters. Your account and password hash are stored securely; email verification is not required.
        </p>
        {error && (
          <p role="alert" className="notice notice-danger">
            {error}
          </p>
        )}
        <button className="wise-cta-wide" disabled={busy}>
          Create account
        </button>
        <Link to="/login">Already have an account?</Link>
      </form>
    </div>
  );
}
