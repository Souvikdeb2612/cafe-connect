import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  ShoppingBasket,
  Receipt,
  TrendingUp,
  TrendingDown,
  Store,
  Wallet,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

const Dashboard = () => {
  const { selectedOutletId, isAllOutletsSelected } = useOutlet();
  const { isAdmin } = useAuth();
  const [monthSales, setMonthSales] = useState(0);
  const [monthExpenses, setMonthExpenses] = useState(0);
  const [monthGrocery, setMonthGrocery] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalGrocery, setTotalGrocery] = useState(0);
  const [monthlySales, setMonthlySales] = useState<any[]>([]);
  const [outletComparison, setOutletComparison] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const INITIAL_CASH = 1920;
  const CUTOFF_DATE = "2026-03-24";

  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchKPIs(), fetchMonthlySales()]).finally(() =>
      setLoading(false),
    );
  }, [selectedOutletId]);

  useEffect(() => {
    if (isAdmin) fetchOutletComparison();
  }, [isAdmin]);

  const fetchKPIs = async () => {
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

    const allSalesQuery = isAllOutletsSelected
      ? supabase.from("sales").select("total_revenue").gte("date", CUTOFF_DATE)
      : supabase
          .from("sales")
          .select("total_revenue")
          .eq("outlet_id", selectedOutletId!)
          .gte("date", CUTOFF_DATE);

    const allExpensesQuery = isAllOutletsSelected
      ? supabase.from("expenses").select("amount").gte("date", CUTOFF_DATE)
      : supabase
          .from("expenses")
          .select("amount")
          .eq("outlet_id", selectedOutletId!)
          .gte("date", CUTOFF_DATE);

    const allGroceryQuery = isAllOutletsSelected
      ? supabase
          .from("grocery_purchases")
          .select("cost")
          .gte("date", CUTOFF_DATE)
      : supabase
          .from("grocery_purchases")
          .select("cost")
          .eq("outlet_id", selectedOutletId!)
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

    setMonthSales(
      (sales.data || []).reduce((s, r) => s + Number(r.total_revenue), 0),
    );
    setMonthExpenses(
      (expenses.data || []).reduce((s, r) => s + Number(r.amount), 0),
    );
    setMonthGrocery(
      (grocery.data || []).reduce((s, r) => s + Number(r.cost), 0),
    );
    setTotalSales(
      (allSales.data || []).reduce((s, r) => s + Number(r.total_revenue), 0),
    );
    setTotalExpenses(
      (allExpenses.data || []).reduce((s, r) => s + Number(r.amount), 0),
    );
    setTotalGrocery(
      (allGrocery.data || []).reduce((s, r) => s + Number(r.cost), 0),
    );
  };

  const KPICard = ({
    title,
    value,
    icon: Icon,
    color,
    loading,
  }: {
    title: string;
    value: number;
    icon: any;
    color: string;
    loading: boolean;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`h-5 w-5 ${color}`} aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div
            className="text-2xl font-bold"
            aria-label={`${title}: ₹${value.toLocaleString()}`}
          >
            ₹{value.toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const fetchMonthlySales = async () => {
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
        const { data } = await query;
        return {
          name: m.label,
          revenue: (data || []).reduce(
            (s, r) => s + Number(r.total_revenue),
            0,
          ),
        };
      }),
    );
    setMonthlySales(results);
  };

  const fetchOutletComparison = async () => {
    const { data: outlets } = await supabase
      .from("outlets")
      .select("id, name")
      .eq("is_active", true);
    if (!outlets) return;

    const results = await Promise.all(
      outlets.map(async (o) => {
        const { data } = await supabase
          .from("sales")
          .select("total_revenue")
          .eq("outlet_id", o.id)
          .gte("date", monthStart)
          .lte("date", monthEnd);
        return {
          name: o.name,
          revenue: (data || []).reduce(
            (s, r) => s + Number(r.total_revenue),
            0,
          ),
        };
      }),
    );
    setOutletComparison(results);
  };

  // Combined expenses for cash calculation (spreadsheet combines groceries + other expenses)
  const combinedMonthExpenses = monthExpenses + monthGrocery;
  const combinedTotalExpenses = totalExpenses + totalGrocery;

  const profit = monthSales - combinedMonthExpenses;
  const availableCash = INITIAL_CASH + totalSales - combinedTotalExpenses;

  const kpis = [
    {
      title: "Monthly Sales",
      value: monthSales,
      icon: DollarSign,
      color: "text-primary",
    },
    {
      title: "Monthly Grocery Costs",
      value: monthGrocery,
      icon: ShoppingBasket,
      color: "text-orange-500",
    },
    {
      title: "Monthly Expenses",
      value: monthExpenses,
      icon: Receipt,
      color: "text-destructive",
    },
    {
      title: "Monthly Profit",
      value: profit,
      icon: profit >= 0 ? TrendingUp : TrendingDown,
      color: profit >= 0 ? "text-emerald-500" : "text-destructive",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview for {format(new Date(), "MMMM yyyy")}
          {isAllOutletsSelected ? " — All Outlets" : ""}
        </p>
      </header>

      <section
        aria-label="Key metrics"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {kpis.map((kpi) => (
          <KPICard key={kpi.title} {...kpi} loading={loading} />
        ))}
      </section>

      {/* Available Cash - only shown when All Outlets is selected (centralized data) */}
      {isAllOutletsSelected && (
        <section
          aria-label="Cash position"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Available Cash
              </CardTitle>
              <Wallet
                className={`h-5 w-5 ${availableCash >= 0 ? "text-emerald-500" : "text-destructive"}`}
                aria-hidden="true"
              />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div
                  className="text-2xl font-bold"
                  aria-label={`Available Cash: ₹${availableCash.toLocaleString()}`}
                >
                  ₹{availableCash.toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : monthlySales.length === 0 ? (
              <div className="h-[280px] flex flex-col items-center justify-center text-center text-muted-foreground">
                <TrendingUp
                  className="h-10 w-10 mb-3 opacity-50"
                  aria-hidden="true"
                />
                <p className="text-sm">No sales data yet</p>
                <p className="text-xs mt-1">
                  Record your first sale to see trends
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthlySales}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    formatter={(value: number) => [
                      `₹${value.toLocaleString()}`,
                      "Revenue",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Outlet Comparison (This Month)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[280px] w-full" />
              ) : outletComparison.length === 0 ? (
                <div className="h-[280px] flex flex-col items-center justify-center text-center text-muted-foreground">
                  <Store
                    className="h-10 w-10 mb-3 opacity-50"
                    aria-hidden="true"
                  />
                  <p className="text-sm">No outlets to compare</p>
                  <p className="text-xs mt-1">
                    Add more outlets to see comparison
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={outletComparison}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        `₹${value.toLocaleString()}`,
                        "Revenue",
                      ]}
                    />
                    <Bar
                      dataKey="revenue"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
