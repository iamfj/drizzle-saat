import { defineFixture, faker, ref } from "saat";
import { postTags, posts, tags } from "../db/schema";

// Tags, posts, and the post↔tag many-to-many. The interesting bit is
// `metadata`: a JSON column whose `pinnedBy` is a *nested* ref — saat resolves
// refs embedded inside objects/arrays, not just top-level columns.
export default defineFixture({
  seeds: [
    {
      table: tags,
      namespace: "tag",
      count: 12,
      data: ({ index }) => ({ label: `${faker.word.adjective()}-${index}` }),
    },
    {
      table: posts,
      namespace: "post",
      count: 120,
      data: () => ({
        authorId: ref("user").random(),
        body: faker.lorem.paragraph(),
        metadata: {
          lang: faker.helpers.arrayElement(["en", "de", "fr"]),
          pinnedBy: ref("user", "ada"), // ← nested ref inside a JSON column
        },
        createdAt: faker.date
          .recent({ days: 30, refDate: "2026-06-01T00:00:00.000Z" })
          .toISOString(),
      }),
    },
    {
      table: postTags,
      namespace: "postTag",
      count: 200,
      data: () => ({
        postId: ref("post").random(),
        tagId: ref("tag").random(),
      }),
    },
  ],
});
