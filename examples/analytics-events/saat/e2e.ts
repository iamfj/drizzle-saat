import { defineFixture, ref } from "saat";
import { events } from "../db/schema";

// `scenario: "e2e"` — only seeded with `--scenario e2e`. Exact, known events your
// end-to-end tests can assert against, pinned to the base `demo` workspace/user.
export default defineFixture({
  scenario: "e2e",
  seeds: [
    {
      table: events,
      namespace: "e2eEvent",
      rows: {
        signup: {
          workspaceId: ref("workspace", "demo"),
          userId: ref("user", "demoUser"),
          name: "signup",
          properties: { source: "web", value: 1 },
          ts: "2026-06-01T10:00:00.000Z",
        },
        purchase: {
          workspaceId: ref("workspace", "demo"),
          userId: ref("user", "demoUser"),
          name: "purchase",
          properties: { source: "web", value: 4900 },
          ts: "2026-06-01T10:05:00.000Z",
        },
      },
    },
  ],
});
