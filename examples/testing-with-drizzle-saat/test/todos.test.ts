import { expect, test } from "bun:test";
import { seededDb } from "./helper";

const one = <T>(row: unknown) => row as T;

test("gives every test a fresh, fully-populated database", async () => {
  const db = await seededDb();
  expect(one<{ n: number }>(db.query("SELECT count(*) n FROM users").get()).n).toBe(6);
  expect(one<{ n: number }>(db.query("SELECT count(*) n FROM todos").get()).n).toBe(21);
});

test("keyed rows are stable anchors to assert against", async () => {
  const db = await seededDb();
  const alice = one<{ id: number }>(
    db.query("SELECT id FROM users WHERE email = 'alice@example.com'").get(),
  );
  const welcome = one<{ user_id: number; priority: string }>(
    db.query("SELECT user_id, priority FROM todos WHERE title = 'Welcome to drizzle-saat'").get(),
  );
  // The keyed todo resolved its ref("user", "alice") to Alice's real id.
  expect(welcome.user_id).toBe(alice.id);
  expect(welcome.priority).toBe("high");
});

test("is deterministic — same seed, same data", async () => {
  const a = await seededDb(7);
  const b = await seededDb(7);
  const dump = (c: Awaited<ReturnType<typeof seededDb>>) =>
    c.query("SELECT * FROM todos ORDER BY id").all();
  expect(dump(a)).toEqual(dump(b));
});

test("a different seed produces different data", async () => {
  const a = await seededDb(1);
  const b = await seededDb(2);
  const titles = (c: Awaited<ReturnType<typeof seededDb>>) =>
    c.query("SELECT title FROM todos ORDER BY id").all();
  expect(titles(a)).not.toEqual(titles(b));
});

test("every todo has a valid user (no orphan foreign keys)", async () => {
  const db = await seededDb();
  const orphans = one<{ n: number }>(
    db
      .query(
        "SELECT count(*) n FROM todos t LEFT JOIN users u ON t.user_id = u.id WHERE u.id IS NULL",
      )
      .get(),
  );
  expect(orphans.n).toBe(0);
});
