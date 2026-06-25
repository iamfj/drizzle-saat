import { defineFixture, faker, ref } from "drizzle-saat";
import { comments, likes } from "../db/schema";

// Threaded comments + likes. `comment` and `reply` are two namespaces writing
// into the SAME `comments` table: replies reference a root comment via
// `parentId`, so drizzle-saat inserts roots first, then replies.
export default defineFixture({
  seeds: [
    {
      table: comments,
      namespace: "comment",
      count: 150,
      data: () => ({
        postId: ref("post").random(),
        authorId: ref("user").random(),
        body: faker.lorem.sentence(),
        // no parentId → a top-level comment
      }),
    },
    {
      table: comments,
      namespace: "reply",
      count: 100,
      data: () => ({
        postId: ref("post").random(),
        authorId: ref("user").random(),
        parentId: ref("comment").random(), // ← reply threads under a root comment
        body: faker.lorem.sentence(),
      }),
    },
    {
      table: likes,
      namespace: "like",
      count: 300,
      data: () => ({
        userId: ref("user").random(),
        postId: ref("post").random(),
      }),
    },
  ],
});
