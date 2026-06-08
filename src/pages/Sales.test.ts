import { describe, expect, it } from "vitest";
import { buildSaleRows, buildSaleUpdatePayload, resolveSaleOutletId } from "./salesUtils";

describe("buildSaleRows", () => {
  it("keeps individual outlet sale rows when showing all outlets", () => {
    const rows = buildSaleRows(
      [
        {
          id: "sale-older",
          outlet_id: "outlet-1",
          date: "2026-05-20",
          total_revenue: 250,
          notes: "Older sale",
          sale_items: [],
          outlets: { name: "Meherpur" },
        },
        {
          id: "sale-newer",
          outlet_id: "outlet-2",
          date: "2026-05-21",
          total_revenue: 500,
          notes: "Newer sale",
          sale_items: [],
          outlets: { name: "Sadar" },
        },
      ],
      "all"
    );

    expect(rows).toEqual([
      expect.objectContaining({ id: "sale-newer", outlet_id: "outlet-2", outlets: { name: "Sadar" } }),
      expect.objectContaining({ id: "sale-older", outlet_id: "outlet-1", outlets: { name: "Meherpur" } }),
    ]);
  });
});

describe("sale outlet editing helpers", () => {
  it("uses the edited outlet before falling back to the selected outlet", () => {
    expect(resolveSaleOutletId("outlet-2", "outlet-1")).toBe("outlet-2");
    expect(resolveSaleOutletId("", "outlet-1")).toBe("outlet-1");
    expect(resolveSaleOutletId("", "all")).toBe("");
  });

  it("includes outlet_id in sale update payloads", () => {
    expect(buildSaleUpdatePayload("outlet-2", "2026-05-21", 500, "Moved outlet")).toEqual({
      outlet_id: "outlet-2",
      date: "2026-05-21",
      total_revenue: 500,
      notes: "Moved outlet",
    });
  });
});
