import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingBasket, Receipt, TrendingUp, Wallet, Landmark } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek } from "date-fns";

const Dashboard = () => {
  const { selectedOutletId } = useOutlet();
  const { isAdmin } = useAuth();
  const [todaySales, setTodaySales] = useState(0);
  const [todayExpenses, setTodayExpenses] = useState(0);
  const [todayGrocery, setTodayGrocery] = useState(0);
  const [monthlySales, setMonthlySales] = useState<any[]>([]);
  const [outletComparison, setOutletComparison] = useState<any[]>([]);

  // All-outlet totals
  const [totalSales, setTotalSales] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalGrocery, setTotalGrocery] = useState(0);
  const [weeklySales, setWeeklySales] = useState(0);
  const [weeklyExpenses, setWeeklyExpenses] = useState(0);
  const [weeklyGrocery, setWeeklyGrocery] = useState(0);

  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  useEffect(() => {
    if (!selectedOutletId) return;
    fetchKPIs();
    fetchMonthlySales();
  }, [selectedOutletId]);

  useEffect(() => {
    if (isAdmin) {
      fetchOutletComparison();
      fetchAllOutletTotals();
    }
  }, [isAdmin]);

  const fetchKPIs = async () => {
    const [sales, expenses, grocery] = await Promise.all([
      supabase.from("sales").select("total_revenue").eq("outlet_id", selectedOutletId).eq("date", today),
      supabase.from("expenses").select("amount").eq("outlet_id", selectedOutletId).eq("date", today),
      supabase.from("grocery_purchases").select("cost").eq("outlet_id", selectedOutletId).eq("date", today),
    ]);
    setTodaySales((sales.data || []).reduce((s, r) => s + Number(r.total_revenue), 0));
    setTodayExpenses((expenses.data || []).reduce((s, r) => s + Number(r.amount), 0));
    setTodayGrocery((grocery.data || []).reduce((s, r) => s + Number(r.cost), 0));
  };

  const fetchAllOutletTotals = async () => {
    const [monthSales, monthExpenses, monthGrocery, wSales, wExpenses, wGrocery] = await Promise.all([
      supabase.from("sales").select("total_revenue").gte("date", monthStart).lte("date", monthEnd),
      supabase.from("expenses").select("amount").gte("date", monthStart).lte("date", monthEnd),
      supabase.from("grocery_purchases").select("cost").gte("date", monthStart).lte("date", monthEnd),
      supabase.from("sales").select("total_revenue").gte("date", weekStart),
      supabase.from("expenses").select("amount").gte("date", weekStart),
      supabase.from("grocery_purchases").select("cost").gte("date", weekStart),
    ]);
    setTotalSales((monthSales.data || []).reduce((s, r) => s + Number(r.total_revenue), 0));
    setTotalExpenses((monthExpenses.data || []).reduce((s, r) => s + Number(r.amount), 0));
    setTotalGrocery((monthGrocery.data || []).reduce((s, r) => s + Number(r.cost), 0));
    setWeeklySales((wSales.data || []).reduce((s, r) => s + Number(r.total_revenue), 0));
    setWeeklyExpenses((wExpenses.data || []).reduce((s, r) => s + Number(r.amount), 0));
    setWeeklyGrocery((wGrocery.data || []).reduce((s, r) => s + Number(r.cost), 0));
  };

  const fetchMonthlySales = async () => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      return { start: format(startOfMonth(d), "yyyy-MM-dd"), end: format(endOfMonth(d), "yyyy-MM-dd"), label: format(d, "MMM") };
    });

    const results = await Promise.all(
      months.map(async (m) => {
        const { data } = await supabase
          .from("sales")
          .select("total_revenue")
          .eq("outlet_id", selectedOutletId)
          .gte("date", m.start)
          .lte("date", m.end);
        return { name: m.label, revenue: (data || []).reduce((s, r) => s + Number(r.total_revenue), 0) };
      })
    );
    setMonthlySales(results);
  };

  const fetchOutletComparison = async () => {
    const { data: outlets } = await supabase.from("outlets").select("id, name").eq("is_active", true);
    if (!outlets) return;

    const results = await Promise.all(
      outlets.map(async (o) => {
        const { data } = await supabase
          .from("sales")
          .select("total_revenue")
          .eq("outlet_id", o.id)
          .gte("date", monthStart)
          .lte("date", monthEnd);
        return { name: o.name, revenue: (data || []).reduce((s, r) => s + Number(r.total_revenue), 0) };
      })
    );
    setOutletComparison(results);
  };

  const profit = todaySales - todayExpenses - todayGrocery;
  const monthlyProfit = totalSales - totalExpenses - totalGrocery;
  const weeklyProfit = weeklySales - weeklyExpenses - weeklyGrocery;

  const kpis = [
    { title: "Today's Sales", value: todaySales, icon: DollarSign, color: "text-primary" },
    { title: "Grocery Costs", value: todayGrocery, icon: ShoppingBasket, color: "text-accent" },
    { title: "Expenses", value: todayExpenses, icon: Receipt, color: "text-destructive" },
    { title: "Profit", value: profit, icon: TrendingUp, color: profit >= 0 ? "text-accent" : "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Cash in Hand */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {isAdmin && (
          <div className="flex gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 shadow-sm">
              <Wallet className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Weekly Cash in Hand</p>
                <p className={`text-lg font-bold ${weeklyProfit >= 0 ? "text-accent" : "text-destructive"}`}>
                  ₹{weeklyProfit.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 shadow-sm">
              <Landmark className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Monthly Funds</p>
                <p className={`text-lg font-bold ${monthlyProfit >= 0 ? "text-accent" : "text-destructive"}`}>
                  ₹{monthlyProfit.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* All-Outlet Overview (Admin) */}
      {isAdmin && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">All Outlets — Monthly Sales</CardTitle>
              <DollarSign className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{totalSales.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">{format(new Date(), "MMMM yyyy")}</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/20 bg-destructive/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">All Outlets — Monthly Costs</CardTitle>
              <Receipt className="h-5 w-5 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{(totalExpenses + totalGrocery).toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Expenses + Groceries</p>
            </CardContent>
          </Card>
          <Card className="border-accent/20 bg-accent/5">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">All Outlets — Monthly Profit</CardTitle>
              <TrendingUp className={`h-5 w-5 ${monthlyProfit >= 0 ? "text-accent" : "text-destructive"}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${monthlyProfit >= 0 ? "text-accent" : "text-destructive"}`}>
                ₹{monthlyProfit.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Net profit across all outlets</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-Outlet KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{kpi.value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {isAdmin && outletComparison.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outlet Comparison (This Month)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={outletComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Dashboard;