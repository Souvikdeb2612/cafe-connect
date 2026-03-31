import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingBasket, Receipt, TrendingUp, Wallet } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

const Dashboard = () => {
  const { selectedOutletId } = useOutlet();
  const { isAdmin } = useAuth();
  const [todaySales, setTodaySales] = useState(0);
  const [todayExpenses, setTodayExpenses] = useState(0);
  const [todayGrocery, setTodayGrocery] = useState(0);
  const [monthlySales, setMonthlySales] = useState<any[]>([]);
  const [outletComparison, setOutletComparison] = useState<any[]>([]);
  const [totalFunds, setTotalFunds] = useState(0);

  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const isAll = selectedOutletId === "all";

  useEffect(() => {
    fetchTotalFunds();
  }, []);

  useEffect(() => {
    if (!selectedOutletId) return;
    fetchKPIs();
    fetchMonthlySales();
    if (isAdmin && isAll) fetchOutletComparison();
  }, [selectedOutletId]);

  const applyOutletFilter = (query: any) => {
    if (!isAll) return query.eq("outlet_id", selectedOutletId);
    return query;
  };

  const fetchTotalFunds = async () => {
    const [sales, expenses, grocery] = await Promise.all([
      supabase.from("sales").select("total_revenue"),
      supabase.from("expenses").select("amount"),
      supabase.from("grocery_purchases").select("cost"),
    ]);
    const s = (sales.data || []).reduce((sum, r) => sum + Number(r.total_revenue), 0);
    const e = (expenses.data || []).reduce((sum, r) => sum + Number(r.amount), 0);
    const g = (grocery.data || []).reduce((sum, r) => sum + Number(r.cost), 0);
    setTotalFunds(s - e - g);
  };

  const fetchKPIs = async () => {
    let salesQ = supabase.from("sales").select("total_revenue").eq("date", today);
    let expensesQ = supabase.from("expenses").select("amount").eq("date", today);
    let groceryQ = supabase.from("grocery_purchases").select("cost").eq("date", today);

    const [sales, expenses, grocery] = await Promise.all([
      applyOutletFilter(salesQ),
      applyOutletFilter(expensesQ),
      applyOutletFilter(groceryQ),
    ]);
    setTodaySales((sales.data || []).reduce((s, r) => s + Number(r.total_revenue), 0));
    setTodayExpenses((expenses.data || []).reduce((s, r) => s + Number(r.amount), 0));
    setTodayGrocery((grocery.data || []).reduce((s, r) => s + Number(r.cost), 0));
  };

  const fetchMonthlySales = async () => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(new Date(), 5 - i);
      return { start: format(startOfMonth(d), "yyyy-MM-dd"), end: format(endOfMonth(d), "yyyy-MM-dd"), label: format(d, "MMM") };
    });

    const results = await Promise.all(
      months.map(async (m) => {
        let q = supabase.from("sales").select("total_revenue").gte("date", m.start).lte("date", m.end);
        const { data } = await applyOutletFilter(q);
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
          .from("sales").select("total_revenue").eq("outlet_id", o.id)
          .gte("date", monthStart).lte("date", monthEnd);
        return { name: o.name, revenue: (data || []).reduce((s, r) => s + Number(r.total_revenue), 0) };
      })
    );
    setOutletComparison(results);
  };

  const profit = todaySales - todayExpenses - todayGrocery;

  const kpis = [
    { title: "Today's Sales", value: todaySales, icon: DollarSign, color: "text-primary" },
    { title: "Grocery Costs", value: todayGrocery, icon: ShoppingBasket, color: "text-accent" },
    { title: "Expenses", value: todayExpenses, icon: Receipt, color: "text-destructive" },
    { title: "Profit", value: profit, icon: TrendingUp, color: profit >= 0 ? "text-accent" : "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          Dashboard {isAll ? "— All Outlets" : ""}
        </h1>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <Wallet className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Total Funds</p>
            <p className={`text-lg font-bold ${totalFunds >= 0 ? "text-accent" : "text-destructive"}`}>
              ₹{totalFunds.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

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

        {isAdmin && isAll && outletComparison.length > 0 && (
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