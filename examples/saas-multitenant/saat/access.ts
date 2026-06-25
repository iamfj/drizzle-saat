import { defineFixture, faker, ref } from "saat";
import { invitations, memberships } from "../db/schema";

// `memberships` has a COMPOSITE primary key (user_id, project_id). Join rows are
// seeded explicitly as keyed rows so each (user, project) pair is unique and
// deterministic — the clean way to wire a many-to-many. (A composite-PK table
// can't itself be the target of a ref, but it can freely reference others.)
export default defineFixture({
  seeds: [
    {
      table: memberships,
      namespace: "membership",
      rows: {
        aliceLaunch: {
          userId: ref("user", "alice"),
          projectId: ref("project", "launch"),
          role: "owner",
        },
        bobLaunch: {
          userId: ref("user", "bob"),
          projectId: ref("project", "launch"),
          role: "editor",
        },
        aliceWebsite: {
          userId: ref("user", "alice"),
          projectId: ref("project", "website"),
          role: "owner",
        },
        bobWebsite: {
          userId: ref("user", "bob"),
          projectId: ref("project", "website"),
          role: "viewer",
        },
      },
    },
    {
      table: invitations,
      namespace: "invitation",
      count: 30,
      data: () => ({
        orgId: ref("org").random(),
        email: faker.internet.email(),
        invitedBy: ref("user").random(),
        status: faker.helpers.arrayElement(["pending", "accepted", "expired"]),
      }),
    },
  ],
});
