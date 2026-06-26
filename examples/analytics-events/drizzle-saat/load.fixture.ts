import { defineFixture, faker, ref } from "drizzle-saat";
import { events } from "../db/schema";

const EVENT_NAMES = ["page_view", "signup", "purchase", "invite_sent", "export"];

// `scenario: "load"` — only seeded when you pass `--scenario load`. Adds 5,000
// events on top of the base data for performance/load testing. References the
// base `workspace`/`user` namespaces, which always seed.
export default defineFixture({
  scenario: "load",
  seeds: [
    {
      table: events,
      namespace: "loadEvent",
      count: 5_000,
      data: () => ({
        workspaceId: ref("workspace").random(),
        userId: ref("user").random(),
        name: faker.helpers.arrayElement(EVENT_NAMES),
        properties: {
          source: faker.helpers.arrayElement(["web", "ios", "android"]),
          value: faker.number.int({ min: 0, max: 100 }),
        },
        ts: faker.date.recent({ days: 30, refDate: "2026-06-01T00:00:00.000Z" }).toISOString(),
      }),
    },
  ],
});
