import { describe, expect, it } from "vitest";
import { buildExpenseRows } from "./Expenses";

describe("buildExpenseRows", () => {
  it("keeps outlet names when showing all outlet expense data", () => {
    const rows = buildExpenseRows(
      [
        {
          id: "expense-1",
          date: "2026-05-21",
          amount: 200,
          notes: "Bill payment",
          category_id: "electricity",
          categories: { name: "Electricity" },
          outlets: { name: "Meherpur" },
        },
      ],
      "all"
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: "expense-1",
        date: "2026-05-21",
        amount: 200,
        notes: "Bill payment",
        category_id: "electricity",
        categories: { name: "Electricity" },
        outlets: { name: "Meherpur" },
      }),
    ]);
  });
});
