import { defineFixture, faker, ref } from "saat";
import { orderItems, orders } from "../db/schema";

// 80 random orders + 2 hand-picked ones, and 200 line items spread across them.
// Note the different ways to point at a customer:
//   ref("customer").random()            → any customer
//   ref("customer", "vip")              → the keyed VIP from catalog.ts
//   ref("customer").where({country})    → the first matching customer
export default defineFixture({
  seeds: [
    {
      table: orders,
      namespace: "order",
      count: 80,
      data: () => ({
        customerId: ref("customer").random(),
        status: faker.helpers.arrayElement(["pending", "paid", "shipped", "refunded"]),
        totalCents: faker.number.int({ min: 1_000, max: 200_000 }),
        // Anchor time-based fakers to a fixed `refDate` — otherwise they're
        // relative to Date.now() and your seed stops being reproducible.
        placedAt: faker.date
          .recent({ days: 90, refDate: "2026-06-01T00:00:00.000Z" })
          .toISOString(),
      }),
      rows: {
        vipOrder: {
          customerId: ref("customer", "vip"),
          status: "paid",
          totalCents: 19_900,
          placedAt: "2026-01-01T00:00:00.000Z",
        },
        usOrder: {
          customerId: ref("customer").where({ country: "US" }),
          status: "shipped",
          totalCents: 4_200,
          placedAt: "2026-01-02T00:00:00.000Z",
        },
      },
    },
    {
      table: orderItems,
      namespace: "orderItem",
      count: 200,
      data: () => ({
        orderId: ref("order").random(),
        productId: ref("product").random(),
        quantity: faker.number.int({ min: 1, max: 5 }),
        unitPriceCents: faker.number.int({ min: 500, max: 50_000 }),
      }),
    },
  ],
});
