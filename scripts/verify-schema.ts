import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseError } from "pg";
import { pool } from "../src/db/index.js";

type IdRow = { id: string };

async function verify(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Verification is restricted to a local PostgreSQL database.",
  );
  const client = await pool.connect();
  try {
    const version = await client.query<{ version: string }>("SELECT current_setting('server_version') AS version");
    console.log(`PostgreSQL ${version.rows[0]!.version}`);
    await client.query("BEGIN");

    async function expectViolation(
      operation: () => Promise<unknown>,
      code: string,
      constraint?: string,
    ): Promise<void> {
      await client.query("SAVEPOINT expected_failure");
      let failure: unknown;
      try {
        await operation();
      } catch (error: unknown) {
        failure = error;
      }
      await client.query("ROLLBACK TO SAVEPOINT expected_failure");
      await client.query("RELEASE SAVEPOINT expected_failure");
      assert.ok(failure instanceof DatabaseError, "Expected PostgreSQL to reject this operation");
      assert.equal(failure.code, code);
      if (constraint) assert.equal(failure.constraint, constraint);
    }

    const users = await client.query<IdRow>(
      `INSERT INTO "user" (name, email, is_anonymous)
       SELECT 'Schema verification ' || n, $1 || '-' || n || '@example.invalid', true
       FROM generate_series(1, 3) AS n RETURNING id`,
      [randomUUID()],
    );
    assert.equal(users.rowCount, 3);
    const [user1, user2, user3] = users.rows.map((row) => row.id);
    assert.ok(user1 && user2 && user3);

    const room = (await client.query<IdRow>(
      `INSERT INTO rooms (invite_code_hash, owner_id, expires_at)
       VALUES ($1, $2, now() + interval '1 hour') RETURNING id`,
      [randomUUID(), user1],
    )).rows[0]!.id;
    const joined = await client.query(
      `INSERT INTO room_members (room_id, user_id, alias, role)
       VALUES ($1, $2, 'Player One', 'player1'), ($1, $3, 'Player Two', 'player2')`,
      [room, user1, user2],
    );
    assert.equal(joined.rowCount, 2);
    console.log("PASS 1: room created; player1 and player2 joined.");

    await expectViolation(
      () => client.query(
        `INSERT INTO room_members (room_id, user_id, alias, role)
         VALUES ($1, $2, 'Third Player', 'player1')`, [room, user3],
      ),
      "23505", "room_members_room_role_unique",
    );
    console.log("PASS 2: third member rejected (23505, room_members_room_role_unique).");

    const round = (await client.query<IdRow>(
      "INSERT INTO rounds (room_id, scenario_key) VALUES ($1, 'verification') RETURNING id",
      [room],
    )).rows[0]!.id;
    const proposal1 = (await client.query<IdRow>(
      `INSERT INTO proposals (round_id, revision, terms, created_by)
       VALUES ($1, 1, $2::jsonb, $3) RETURNING id`,
      [round, JSON.stringify({ priceMinor: 10000, deliveryDays: 3 }), user1],
    )).rows[0]!.id;
    const accepted = await client.query(
      "INSERT INTO acceptances (proposal_id, user_id) VALUES ($1, $2), ($1, $3)",
      [proposal1, user1, user2],
    );
    assert.equal(accepted.rowCount, 2);
    console.log("PASS 3: revision 1 created; both users accepted.");

    await expectViolation(
      () => client.query("INSERT INTO acceptances (proposal_id, user_id) VALUES ($1, $2)", [proposal1, user1]),
      "23505", "acceptances_proposal_user_unique",
    );
    console.log("PASS 4: duplicate acceptance rejected (23505, acceptances_proposal_user_unique).");

    const proposal2 = (await client.query<IdRow>(
      `INSERT INTO proposals (round_id, revision, terms, created_by)
       VALUES ($1, 2, $2::jsonb, $3) RETURNING id`,
      [round, JSON.stringify({ priceMinor: 11000, deliveryDays: 4 }), user2],
    )).rows[0]!.id;
    const previousAcceptances = await client.query<{ proposal_id: string; revision: number }>(
      `SELECT a.proposal_id, p.revision FROM acceptances a
       JOIN proposals p ON p.id = a.proposal_id WHERE p.round_id = $1`, [round],
    );
    assert.equal(previousAcceptances.rowCount, 2);
    for (const acceptance of previousAcceptances.rows) {
      assert.equal(acceptance.proposal_id, proposal1);
      assert.equal(acceptance.revision, 1);
    }
    const latest = await client.query<IdRow>(
      "SELECT id FROM proposals WHERE round_id = $1 ORDER BY revision DESC LIMIT 1", [round],
    );
    assert.equal(latest.rows[0]!.id, proposal2);
    const newAcceptances = await client.query("SELECT id FROM acceptances WHERE proposal_id = $1", [proposal2]);
    assert.equal(newAcceptances.rowCount, 0);
    console.log("PASS 5: revision 2 is latest; both old acceptances remain on revision 1; revision 2 has none.");

    const advance = await client.query(
      "UPDATE rounds SET version = version + 1, updated_at = now() WHERE id = $1 AND version = 1", [round],
    );
    assert.equal(advance.rowCount, 1);
    const stale = await client.query(
      "UPDATE rounds SET version = version + 1, updated_at = now() WHERE id = $1 AND version = 1", [round],
    );
    assert.equal(stale.rowCount, 0);
    console.log("PASS 6: current-version update succeeded; stale-version update affected 0 rows.");

    await expectViolation(
      () => client.query("UPDATE proposals SET terms = '{}'::jsonb WHERE id = $1", [proposal1]),
      "23514", "proposals_immutable",
    );
    console.log("PASS 7: proposal UPDATE rejected (23514, proposals_immutable).");

    await expectViolation(
      () => client.query("INSERT INTO rounds (room_id, scenario_key) VALUES ($1, 'duplicate')", [room]),
      "23505", "rounds_room_id_unique",
    );
    await expectViolation(
      () => client.query(
        "INSERT INTO proposals (round_id, revision, terms, created_by) VALUES ($1, 1, '{}'::jsonb, $2)",
        [round, user1],
      ),
      "23505", "proposals_round_revision_unique",
    );
    // Free player2's slot inside a savepoint to isolate the room/user constraint.
    await client.query("SAVEPOINT same_user_test");
    await client.query("DELETE FROM room_members WHERE room_id = $1 AND user_id = $2", [room, user2]);
    await expectViolation(
      () => client.query(
        "INSERT INTO room_members (room_id, user_id, alias, role) VALUES ($1, $2, 'Duplicate User', 'player2')",
        [room, user1],
      ),
      "23505", "room_members_room_user_unique",
    );
    await client.query("ROLLBACK TO SAVEPOINT same_user_test");
    await client.query("RELEASE SAVEPOINT same_user_test");
    console.log("PASS 8: duplicate round, proposal revision, and room user rejected by named unique constraints.");

    const tables = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    assert.deepEqual(tables.rows.map((row) => row.tablename), [
      "acceptances", "account", "proposals", "room_members", "rooms", "rounds", "session", "user", "verification",
    ]);
    console.log("PASS 9: exactly 5 application tables and 4 generated Better Auth tables.");
  } finally {
    try {
      await client.query("ROLLBACK");
      console.log("Verification fixtures rolled back.");
    } finally {
      client.release();
    }
  }
}

try {
  await verify();
  console.log("All schema checks passed.");
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
