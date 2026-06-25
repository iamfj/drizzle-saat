import { defineFixture, faker, ref } from "drizzle-saat";
import { customers, products } from "../db/schema";

// Customers and the product catalog. A few keyed rows give stable anchors that
// orders reference by name or by predicate (see orders.ts).
export default defineFixture({
  seeds: [
    {
      table: customers,
      namespace: "customer",
      count: 40,
      data: () => ({
        name: faker.person.fullName(),
        email: faker.internet.email(),
        country: faker.helpers.arrayElement(["US", "DE", "GB", "FR", "JP"]),
      }),
      rows: {
        vip: { name: "Vivian VIP", email: "vivian@example.com", country: "US" },
      },
    },
    {
      table: products,
      namespace: "product",
      count: 30,
      data: () => ({
        sku: faker.string.alphanumeric(8).toUpperCase(),
        name: faker.commerce.productName(),
        priceCents: faker.number.int({ min: 500, max: 50_000 }),
        stock: faker.number.int({ min: 0, max: 500 }),
      }),
      rows: {
        flagship: { sku: "FLAGSHIP1", name: "Flagship Widget", priceCents: 19_900, stock: 999 },
      },
    },
  ],
});
