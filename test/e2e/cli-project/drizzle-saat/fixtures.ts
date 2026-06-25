import { defineFixture, faker, ref } from "drizzle-saat";
import { posts, users } from "../schema";

// Fixtures import `faker` from "drizzle-saat" (the index bundle). The built CLI (the cli
// bundle) seeds them — the cross-bundle path the built-cli determinism test guards.
export default defineFixture({
  seeds: [
    {
      table: users,
      namespace: "user",
      count: 8,
      data: () => ({
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
      }),
    },
    {
      table: posts,
      namespace: "post",
      count: 12,
      data: () => ({
        title: faker.lorem.sentence(),
        body: faker.lorem.paragraph(),
        authorId: ref("user").random(),
      }),
    },
  ],
});
