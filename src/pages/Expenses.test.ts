import { describe, expect, it } from "vitest";
import { buildExpenseRows } from "./Expenses";

describe("buildExpenseRows", () => {
  it("groups expenses from the same date, outlet, and category", () => {
    const rows = buildExpenseRows(
      [
        {
          id: "expense-1",
          date: "2026-07-02",
          amount: 40,
          notes: "Papad x1",
          category_id: "grocery",
          outlet_id: "link-road",
          categories: { name: "Grocery" },
          outlets: { name: "Link Road" },
        },
        {
          id: "expense-2",
          date: "2026-07-02",
          amount: 10,
          notes: "Besan x1",
          category_id: "grocery",
          outlet_id: "link-road",
          categories: { name: "Grocery" },
          outlets: { name: "Link Road" },
        },
      ],
      "all"
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      date: "2026-07-02",
      amount: 50,
      notes: "Papad x1, Besan x1",
      category_id: "grocery",
      categories: { name: "Grocery" },
      outlets: { name: "Link Road" },
      entryCount: 2,
    }));
  });

  it("keeps same-day expenses separate across outlets and categories", () => {
    const rows = buildExpenseRows(
      [
        {
          id: "expense-1",
          date: "2026-07-02",
          amount: 40,
          notes: "Papad x1",
          category_id: "grocery",
          outlet_id: "link-road",
          categories: { name: "Grocery" },
          outlets: { name: "Link Road" },
        },
        {
          id: "expense-2",
          date: "2026-07-02",
          amount: 40,
          notes: "Water",
          category_id: "utilities",
          outlet_id: "link-road",
          categories: { name: "Utilities" },
          outlets: { name: "Link Road" },
        },
        {
          id: "expense-3",
          date: "2026-07-02",
          amount: 40,
          notes: "Papad x1",
          category_id: "grocery",
          outlet_id: "meherpur",
          categories: { name: "Grocery" },
          outlets: { name: "Meherpur" },
        },
      ],
      "all"
    );

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.entryCount === 1)).toBe(true);
  });
});
