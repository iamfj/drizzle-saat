import { defineFixture, faker, ref } from "drizzle-saat";
import { events, users, workspaces } from "../db/schema";

const EVENT_NAMES = ["page_view", "signup", "purchase", "invite_sent", "export"];

// Scenario-less ("base") data: a small, demo-sized dataset that always seeds —
// great for local dev. The `--scenario` fixtures add to this base.
export default defineFixture({
  seeds: [
    {
      table: workspaces,
      namespace: "workspace",
      count: 3,
      data: () => ({
        name: faker.company.name(),
        plan: faker.helpers.arrayElement(["free", "team", "business"]),
      }),
      rows: { demo: { name: "Demo Workspace", plan: "business" } },
    },
    {
      table: users,
      namespace: "user",
      count: 12,
      data: () => ({ workspaceId: ref("workspace").random(), email: faker.internet.email() }),
      rows: { demoUser: { workspaceId: ref("workspace", "demo"), email: "demo@demo.test" } },
    },
    {
      table: events,
      namespace: "event",
      count: 50,
      data: () => ({
        workspaceId: ref("workspace").random(),
        userId: ref("user").random(),
        name: faker.helpers.arrayElement(EVENT_NAMES),
        properties: {
          source: faker.helpers.arrayElement(["web", "ios", "android"]),
          value: faker.number.int({ min: 0, max: 100 }),
        },
        ts: faker.date.recent({ days: 14, refDate: "2026-06-01T00:00:00.000Z" }).toISOString(),
      }),
    },
  ],
});
