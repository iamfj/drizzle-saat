import { defineFixture, faker, ref } from "saat";
import { posts, users } from "../db/schema";

// 25 random users + 1 fixed "admin" you can reference by key, and 100 posts
// each attributed to a random user. ~20 lines → a fully wired, deterministic
// dataset with valid foreign keys.
export default defineFixture({
  seeds: [
    {
      table: users,
      namespace: "user",
      count: 25,
      data: () => ({
        name: faker.person.fullName(),
        email: faker.internet.email(),
      }),
      rows: {
        admin: { name: "Ada Admin", email: "ada@example.com" },
      },
    },
    {
      table: posts,
      namespace: "post",
      count: 100,
      data: () => ({
        title: faker.lorem.sentence(),
        body: faker.lorem.paragraphs(2),
        published: faker.datatype.boolean({ probability: 0.7 }),
        authorId: ref("user").random(),
      }),
    },
  ],
});
