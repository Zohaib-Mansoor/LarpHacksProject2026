import { Link } from 'react-router-dom';
import { LegalDocument } from './LegalDocument';

export default function Terms() {
  return (
    <LegalDocument title="Terms" updated="November 1, 2026">
      <p>
        These terms cover the PlayCall negotiation game as it exists today. By starting a round or
        creating an account, you agree to them.
      </p>

      <h2>Who can play</h2>
      <p>
        You must be 13 or older. The age check is a self-declaration, not age verification. If you are
        under 13, do not play.
      </p>

      <h2>Rounds</h2>
      <p>
        Each round matches two anonymous strangers for five minutes of text negotiation. You appear to
        the other player only as a server-assigned alias — never as your account name.
      </p>
      <p>
        The other player sees everything you type in a round. Do not share personal information — real
        names, contact details, or anything you would not hand a stranger.
      </p>

      <h2>Conduct</h2>
      <p>
        Play your role honestly and keep rounds civil. Harassment, abuse, and unlawful content are not
        allowed. If a round goes wrong, leave it and use the report control in the room.
      </p>

      <h2>Accounts</h2>
      <p>
        An account is optional — you can play as a guest. If you create one, you are responsible for your
        credentials and the activity under it. You can delete your account at any time from the account
        page.
      </p>

      <h2>Text only</h2>
      <p>PlayCall is text-only. There is no video and no voice calling today.</p>

      <h2>The service</h2>
      <p>
        PlayCall is an experimental project provided as-is. It may change, break, or be unavailable.
        Mission points and standings are part of the game and have no monetary value.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        If these terms change, the date above changes with them. Continuing to play after a change means
        you accept the updated terms.
      </p>

      <p className="legal-see-also">
        See also: <Link to="/privacy">Privacy</Link>
      </p>
    </LegalDocument>
  );
}
