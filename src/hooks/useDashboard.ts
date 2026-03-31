import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

interface DashboardKPIs {
  monthSales: number;
  monthExpenses: number;
  monthGrocery: number;
  totalSales: number;
  totalExpenses: number;
  totalGrocery: number;
}

interface MonthlySalesData {
  name: string;
  revenue: number;
}

interface OutletComparisonData {
  name: string;
  revenue: number;
}

const INITIAL_CASH = 1920;
const CUTOFF_DATE = "2026-03-24";

// Fetch dashboard KPIs
const fetchDashboardKPIs = async (
  selectedOutletId: string | null,
  isAllOutletsSelected: boolean,
): Promise<DashboardKPIs> => {
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  // Build queries conditionally based on whether "All Outlets" is selected
  const salesQuery = isAllOutletsSelected
    ? supabase
        .from("sales")
        .select("total_revenue")
        .gte("date", monthStart)
        .lte("date", monthEnd)
    : supabase
        .from("sales")
        .select("total_revenue")
        .eq("outlet_id", selectedOutletId!)
        .gte("date", monthStart)
        .lte("date", monthEnd);

  const expensesQuery = isAllOutletsSelected
    ? supabase
        .from("expenses")
        .select("amount")
        .gte("date", monthStart)
        .lte("date", monthEnd)
    : supabase
        .from("expenses")
        .select("amount")
        .eq("outlet_id", selectedOutletId!)
        .gte("date", monthStart)
        .lte("date", monthEnd);

  const groceryQuery = isAllOutletsSelected
    ? supabase
        .from("grocery_purchases")
        .select("cost")
        .gte("date", monthStart)
        .lte("date", monthEnd)
    : supabase
        .from("grocery_purchases")
        .select("cost")
        .eq("outlet_id", selectedOutletId!)
        .gte("date", monthStart)
        .lte("date", monthEnd);

  // Always fetch aggregated data across all outlets for cash calculation
  const allSalesQuery = supabase
    .from("sales")
    .select("total_revenue")
    .gte("date", CUTOFF_DATE);

  const allExpensesQuery = supabase
    .from("expenses")
    .select("amount")
    .gte("date", CUTOFF_DATE);

  const allGroceryQuery = supabase
    .from("grocery_purchases")
    .select("cost")
    .gte("date", CUTOFF_DATE);

  const [sales, expenses, grocery, allSales, allExpenses, allGrocery] =
    await Promise.all([
      salesQuery,
      expensesQuery,
      groceryQuery,
      allSalesQuery,
      allExpensesQuery,
      allGroceryQuery,
    ]);

  return {
    monthSales: (sales.data || []).reduce(
      (s, r) => s + Number(r.total_revenue),
      0,
    ),
    monthExpenses: (expenses.data || []).reduce(
      (s, r) => s + Number(r.amount),
      0,
    ),
    monthGrocery: (grocery.data || []).reduce((s, r) => s + Number(r.cost), 0),
    totalSales: (allSales.data || []).reduce(
      (s, r) => s + Number(r.total_revenue),
      0,
    ),
    totalExpenses: (allExpenses.data || []).reduce(
      (s, r) => s + Number(r.amount),
      0,
    ),
    totalGrocery: (allGrocery.data || []).reduce(
      (s, r) => s + Number(r.cost),
      0,
    ),
  };
};

// Fetch monthly sales trend (6 months)
const fetchMonthlySales = async (
  selectedOutletId: string | null,
  isAllOutletsSelected: boolean,
): Promise<MonthlySalesData[]> => {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), 5 - i);
    return {
      start: format(startOfMonth(d), "yyyy-MM-dd"),
      end: format(endOfMonth(d), "yyyy-MM-dd"),
      label: format(d, "MMM"),
    };
  });

  const results = await Promise.all(
    months.map(async (m) => {
      let query = supabase
        .from("sales")
        .select("total_revenue")
        .gte("date", m.start)
        .lte("date", m.end);

      if (!isAllOutletsSelected && selectedOutletId) {
        query = query.eq("outlet_id", selectedOutletId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return {
        name: m.label,
        revenue: (data || []).reduce((s, r) => s + Number(r.total_revenue), 0),
      };
    }),
  );

  return results;
};

// Fetch outlet comparison data (admin only)
const fetchOutletComparison = async (): Promise<OutletComparisonData[]> => {
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const { data: outlets, error: outletsError } = await supabase
    .from("outlets")
    .select("id, name")
    .eq("is_active", true);

  if (outletsError) throw outletsError;
  if (!outlets) return [];

  const results = await Promise.all(
    outlets.map(async (o) => {
      const { data, error } = await supabase
        .from("sales")
        .select("total_revenue")
        .eq("outlet_id", o.id)
        .gte("date", monthStart)
        .lte("date", monthEnd);

      if (error) throw error;

      return {
        name: o.name,
        revenue: (data || []).reduce((s, r) => s + Number(r.total_revenue), 0),
      };
    }),
  );

  return results;
};

// Hook for fetching dashboard KPIs
export const useDashboardKPIs = (
  selectedOutletId: string | null,
  isAllOutletsSelected: boolean,
) => {
  return useQuery({
    queryKey: ["dashboard", "kpis", selectedOutletId],
    queryFn: () => fetchDashboardKPIs(selectedOutletId, isAllOutletsSelected),
    enabled: !!selectedOutletId,
  });
};

// Hook for fetching monthly sales trend
export const useMonthlySales = (
  selectedOutletId: string | null,
  isAllOutletsSelected: boolean,
) => {
  return useQuery({
    queryKey: ["dashboard", "monthlySales", selectedOutletId],
    queryFn: () => fetchMonthlySales(selectedOutletId, isAllOutletsSelected),
    enabled: !!selectedOutletId,
  });
};

// Hook for fetching outlet comparison (admin only)
export const useOutletComparison = (
  isAdmin: boolean,
  selectedOutletId: string | null,
) => {
  return useQuery({
    queryKey: ["dashboard", "outletComparison", selectedOutletId],
    queryFn: fetchOutletComparison,
    enabled: isAdmin,
  });
};
