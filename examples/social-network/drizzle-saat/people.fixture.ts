import { defineFixture, faker, ref } from "drizzle-saat";
import { follows, users } from "../db/schema";

// 80 users (+ a keyed "ada" we pin posts to) and 150 follow edges between them.
// `index` keeps the unique `handle` collision-free across bulk rows.
export default defineFixture({
  seeds: [
    {
      table: users,
      namespace: "user",
      count: 80,
      data: ({ index }) => ({
        handle: `${faker.internet.username().toLowerCase()}_${index}`,
        name: faker.person.fullName(),
        bio: faker.person.bio(),
      }),
      rows: {
        ada: { handle: "ada", name: "Ada Lovelace", bio: "Founder. Pins the good posts." },
      },
    },
    {
      table: follows,
      namespace: "follow",
      count: 150,
      data: () => ({
        followerId: ref("user").random(),
        followeeId: ref("user").random(),
      }),
    },
  ],
});
