import { defineFixture, faker, ref } from "saat";
import { organizations, projects, users } from "../db/schema";

// Tenants and their members/projects. Every user and project is scoped to an
// org via a ref — that's the multi-tenant backbone. Keyed orgs/users/projects
// give stable anchors that the access fixtures (memberships) reference.
export default defineFixture({
  seeds: [
    {
      table: organizations,
      namespace: "org",
      count: 5,
      data: () => ({
        name: faker.company.name(),
        plan: faker.helpers.arrayElement(["free", "pro", "enterprise"]),
      }),
      rows: {
        acme: { name: "Acme Inc", plan: "enterprise" },
      },
    },
    {
      table: users,
      namespace: "user",
      count: 60,
      data: () => ({
        orgId: ref("org").random(),
        name: faker.person.fullName(),
        email: faker.internet.email(),
        role: faker.helpers.arrayElement(["owner", "admin", "member"]),
      }),
      rows: {
        alice: {
          orgId: ref("org", "acme"),
          name: "Alice Owner",
          email: "alice@acme.test",
          role: "owner",
        },
        bob: {
          orgId: ref("org", "acme"),
          name: "Bob Admin",
          email: "bob@acme.test",
          role: "admin",
        },
      },
    },
    {
      table: projects,
      namespace: "project",
      count: 20,
      data: () => ({
        orgId: ref("org").random(),
        name: faker.commerce.productName(),
        status: faker.helpers.arrayElement(["active", "archived"]),
      }),
      rows: {
        launch: { orgId: ref("org", "acme"), name: "Launch", status: "active" },
        website: { orgId: ref("org", "acme"), name: "Website", status: "active" },
      },
    },
  ],
});
