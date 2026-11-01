import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ensureSession, syncAccount } from "../lib/api";
import { useSession } from "../providers/SessionProvider";
export default function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useSession();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.message || "Unable to sign in.");
      await syncAccount();
      await refresh();
      navigate("/play");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <p className="kicker mono">CALLER ACCESS</p>
        <h1 className="display auth-title">Welcome back</h1>
        <p className="auth-sub">
          Sign in to restore your saved profile and rounds.
        </p>
        <label className="flow-input-block">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="flow-input-block">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" className="notice notice-danger">
            {error}
          </p>
        )}
        <button className="wise-cta-wide" disabled={busy}>
          Sign in
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={async () => {
            await ensureSession();
            navigate("/play");
          }}
        >
          Continue as guest
        </button>
        <p className="auth-foot">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
