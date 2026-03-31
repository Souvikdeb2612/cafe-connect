import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SaleItem {
  item_name: string;
  quantity: number;
  price: number;
}

interface Sale {
  id: string;
  date: string;
  total_revenue: number;
  notes: string;
  sale_items: SaleItem[];
}

interface AggregatedSale {
  date: string;
  total_revenue: number;
  outlet_count: number;
}

interface CreateSalePayload {
  outlet_id: string;
  date: string;
  total_revenue: number;
  notes: string;
  created_by: string | undefined;
  items: SaleItem[];
}

// Fetch sales - returns different shapes based on outlet selection
const fetchSales = async (
  selectedOutletId: string | null,
  isAllOutletsSelected: boolean,
): Promise<{ sales: Sale[]; aggregatedSales: AggregatedSale[] }> => {
  if (isAllOutletsSelected) {
    // Fetch aggregated sales by date for all outlets
    const { data, error } = await supabase
      .from("sales")
      .select("date, total_revenue, outlet_id")
      .order("date", { ascending: false });

    if (error) throw error;

    if (data) {
      // Aggregate sales by date
      const grouped = data.reduce(
        (acc, sale) => {
          const date = sale.date;
          if (!acc[date]) {
            acc[date] = { date, total_revenue: 0, outlet_count: new Set() };
          }
          acc[date].total_revenue += Number(sale.total_revenue);
          acc[date].outlet_count.add(sale.outlet_id);
          return acc;
        },
        {} as Record<
          string,
          { date: string; total_revenue: number; outlet_count: Set<string> }
        >,
      );

      const aggregated = Object.values(grouped)
        .map((g) => ({
          date: g.date,
          total_revenue: g.total_revenue,
          outlet_count: g.outlet_count.size,
        }))
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

      return { sales: [], aggregatedSales: aggregated };
    }
    return { sales: [], aggregatedSales: [] };
  } else {
    // Fetch individual sales for specific outlet
    const { data, error } = await supabase
      .from("sales")
      .select("*, sale_items(*)")
      .eq("outlet_id", selectedOutletId!)
      .order("date", { ascending: false });

    if (error) throw error;
    return { sales: data || [], aggregatedSales: [] };
  }
};

// Create sale with sale_items
const createSale = async (payload: CreateSalePayload): Promise<void> => {
  const { items, ...saleData } = payload;

  // Insert sale
  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert(saleData)
    .select()
    .single();

  if (saleError) throw saleError;

  // Insert sale items
  const validItems = items.filter((it) => it.item_name.trim());
  if (validItems.length > 0) {
    const { error: itemsError } = await supabase.from("sale_items").insert(
      validItems.map((it) => ({
        sale_id: sale.id,
        item_name: it.item_name,
        quantity: it.quantity,
        price: it.price,
      })),
    );

    if (itemsError) throw itemsError;
  }
};

// Hook for fetching sales
export const useSales = (
  selectedOutletId: string | null,
  isAllOutletsSelected: boolean,
) => {
  return useQuery({
    queryKey: ["sales", selectedOutletId],
    queryFn: () => fetchSales(selectedOutletId, isAllOutletsSelected),
    enabled: !!selectedOutletId,
  });
};

// Hook for creating a sale
export const useCreateSale = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
};
