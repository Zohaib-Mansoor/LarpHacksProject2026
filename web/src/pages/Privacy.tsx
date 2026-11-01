import { Link } from 'react-router-dom';
import { LegalDocument } from './LegalDocument';

export default function Privacy() {
  return (
    <LegalDocument title="Privacy" updated="November 1, 2026">
      <p>
        PlayCall is a text-only negotiation game: two anonymous strangers are matched for a five-minute
        round. This page describes what the service does with your information today — nothing more.
      </p>

      <h2>Playing as a guest</h2>
      <p>
        You do not need an account to play. A guest session uses a session cookie to hold your place in
        matchmaking and your current round. Guests provide no name, email, or birth date.
      </p>

      <h2>Age</h2>
      <p>
        PlayCall is for ages 13 and up. Before playing, you confirm you are 13 or older. This is a
        self-declaration, not age verification — we do not independently verify anyone's age. Account
        sign-up asks for a birth date; guest play relies on that confirmation alone.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          Round text. The messages and proposals you send are stored with the round, so both players can
          read the negotiation and see its result.
        </li>
        <li>Match and deal records — who was matched, what was agreed or not, and mission points earned.</li>
        <li>Account data (accounts only) — display name, email, and birth date.</li>
      </ul>
      <p>
        Strangers never see your account name or email. In a round you appear only as a server-assigned
        anonymous alias.
      </p>

      <h2>No voice, no video</h2>
      <p>
        PlayCall has no voice or video calling today. No audio or video is captured, transmitted, or
        stored. If voice is ever added, this page will say so.
      </p>

      <h2>Your controls</h2>
      <ul>
        <li>You can leave any round at any time.</li>
        <li>You can report a round from the room.</li>
        <li>Account holders can delete their account — and its data — from the account page.</li>
      </ul>

      <h2>Leaderboard</h2>
      <p>
        Public leaderboard participation is opt-in and can only be turned on from the account page. The
        leaderboard shows your alias and mission points — never round text or account details.
      </p>

      <p className="legal-see-also">
        See also: <Link to="/terms">Terms</Link>
      </p>
    </LegalDocument>
  );
}
