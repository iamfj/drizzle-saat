import { defineFixture, faker, ref } from "drizzle-saat";
import { todos, users } from "../db/schema";

// A keyed "alice" user and a keyed "welcome" todo give your tests stable anchors
// to assert against, while the bulk rows provide realistic surrounding data.
export default defineFixture({
  seeds: [
    {
      table: users,
      namespace: "user",
      count: 5,
      data: () => ({ name: faker.person.fullName(), email: faker.internet.email() }),
      rows: { alice: { name: "Alice", email: "alice@example.com" } },
    },
    {
      table: todos,
      namespace: "todo",
      count: 20,
      data: () => ({
        userId: ref("user").random(),
        title: faker.hacker.phrase(),
        done: faker.datatype.boolean(),
        priority: faker.helpers.arrayElement(["low", "med", "high"]),
      }),
      rows: {
        welcome: {
          userId: ref("user", "alice"),
          title: "Welcome to drizzle-saat",
          done: false,
          priority: "high",
        },
      },
    },
  ],
});
