export interface SaleItem {
  item_name: string;
  quantity: number;
  price: number;
}

export interface Sale {
  id: string;
  outlet_id: string;
  date: string;
  total_revenue: number;
  notes: string;
  sale_items: SaleItem[];
  outlets?: { name: string };
}

export const buildSaleRows = (data: Sale[] | null | undefined, selectedOutletId: string | null) => {
  const rows = [...(data || [])];

  if (selectedOutletId === "all") {
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }

  return rows;
};

export const resolveSaleOutletId = (formOutletId: string, selectedOutletId: string | null) => {
  if (formOutletId && formOutletId !== "all") return formOutletId;
  if (selectedOutletId && selectedOutletId !== "all") return selectedOutletId;
  return "";
};

export const buildSaleUpdatePayload = (outletId: string, date: string, totalRevenue: number, notes: string) => ({
  outlet_id: outletId,
  date,
  total_revenue: totalRevenue,
  notes,
});

export const buildSaleInsertPayload = (
  outletId: string,
  date: string,
  totalRevenue: number,
  notes: string,
  userId?: string
) => ({
  ...buildSaleUpdatePayload(outletId, date, totalRevenue, notes),
  created_by: userId,
});
