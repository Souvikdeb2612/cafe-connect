import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DollarSign,
  Receipt,
  TrendingUp,
  Wallet,
  Plus,
  ChevronLeft,
  ChevronRight,
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
import { format, startOfMonth, endOfMonth, subMonths, addMonths, eachDayOfInterval, isBefore } from "date-fns";
import { Area, AreaChart } from "recharts";
import { toast } from "sonner";

const Dashboard = () => {
  const { selectedOutletId } = useOutlet();
  const { isAdmin } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [monthSales, setMonthSales] = useState(0);
  const [monthExpenses, setMonthExpenses] = useState(0);
  const [monthlySales, setMonthlySales] = useState<any[]>([]);
  const [monthlyExpenses, setMonthlyExpenses] = useState<any[]>([]);
  const [dailyFunds, setDailyFunds] = useState<any[]>([]);
  const [totalFunds, setTotalFunds] = useState(0);
  const [capitalModalOpen, setCapitalModalOpen] = useState(false);
  const [capitalAmount, setCapitalAmount] = useState("");
  const [capitalNote, setCapitalNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAll = selectedOutletId === "all";

  const monthStart = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
  const monthLabel = format(selectedMonth, "MMMM yyyy");

  const goToPrevMonth = () => setSelectedMonth((prev) => subMonths(prev, 1));
  const goToNextMonth = () => {
    const next = addMonths(selectedMonth, 1);
    if (next <= new Date()) setSelectedMonth(next);
  };
  const isCurrentMonth = format(selectedMonth, "yyyy-MM") === format(new Date(), "yyyy-MM");

  useEffect(() => {
    fetchTotalFunds();
  }, []);

  useEffect(() => {
    if (!selectedOutletId) return;
    fetchKPIs();
    fetchMonthlySales();
    fetchMonthlyExpenses();
  }, [selectedOutletId, selectedMonth]);

  const applyOutletFilter = (query: any) => {
    if (!isAll) return query.eq("outlet_id", selectedOutletId);
    return query;
  };

  const fetchTotalFunds = async () => {
    const [sales, expenses, capital] = await Promise.all([
      supabase.from("sales").select("total_revenue"),
      supabase.from("expenses").select("amount"),
      supabase.from("capital_additions").select("amount"),
    ]);
    const s = (sales.data || []).reduce((sum, r) => sum + Number(r.total_revenue), 0);
    const e = (expenses.data || []).reduce((sum, r) => sum + Number(r.amount), 0);
    const c = (capital.data || []).reduce((sum, r) => sum + Number(r.amount), 0);
    setTotalFunds(s - e + c);
  };

  const handleAddCapital = async () => {
    const amount = parseFloat(capitalAmount);
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("capital_additions").insert({
      amount,
      note: capitalNote || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Failed to add capital: " + error.message);
      return;
    }
    toast.success("Capital added successfully");
    setCapitalAmount("");
    setCapitalNote("");
    setCapitalModalOpen(false);
    fetchTotalFunds();
  };

  const fetchKPIs = async () => {
    let salesQ = supabase.from("sales").select("total_revenue").gte("date", monthStart).lte("date", monthEnd);
    let expensesQ = supabase.from("expenses").select("amount").gte("date", monthStart).lte("date", monthEnd);

    const [sales, expenses] = await Promise.all([
      applyOutletFilter(salesQ),
      applyOutletFilter(expensesQ),
    ]);
    setMonthSales((sales.data || []).reduce((s, r) => s + Number(r.total_revenue), 0));
    setMonthExpenses((expenses.data || []).reduce((s, r) => s + Number(r.amount), 0));
  };

  const fetchMonthlySales = async () => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(selectedMonth, 5 - i);
      return {
        start: format(startOfMonth(d), "yyyy-MM-dd"),
        end: format(endOfMonth(d), "yyyy-MM-dd"),
        label: format(d, "MMM"),
      };
    });

    const results = await Promise.all(
      months.map(async (m) => {
        let q = supabase.from("sales").select("total_revenue").gte("date", m.start).lte("date", m.end);
        const { data } = await applyOutletFilter(q);
        return { name: m.label, revenue: (data || []).reduce((s, r) => s + Number(r.total_revenue), 0) };
      }),
    );
    setMonthlySales(results);
  };

  const fetchMonthlyExpenses = async () => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(selectedMonth, 5 - i);
      return {
        start: format(startOfMonth(d), "yyyy-MM-dd"),
        end: format(endOfMonth(d), "yyyy-MM-dd"),
        label: format(d, "MMM"),
      };
    });

    const results = await Promise.all(
      months.map(async (m) => {
        let q = supabase.from("expenses").select("amount").gte("date", m.start).lte("date", m.end);
        const { data } = await applyOutletFilter(q);
        return { name: m.label, expenses: (data || []).reduce((s, r) => s + Number(r.amount), 0) };
      }),
    );
    setMonthlyExpenses(results);
  };

  const profit = monthSales - monthExpenses;

  const kpis = [
    { title: "Sales", value: monthSales, icon: DollarSign, color: "text-primary" },
    { title: "Expenses", value: monthExpenses, icon: Receipt, color: "text-destructive" },
    { title: "Profit", value: profit, icon: TrendingUp, color: profit >= 0 ? "text-accent" : "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          Dashboard {isAll ? "— All Outlets" : ""}
        </h1>
        <button
          onClick={() => setCapitalModalOpen(true)}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 shadow-sm hover:bg-muted transition-colors cursor-pointer"
        >
          <Wallet className="h-4 w-4 text-primary" />
          <div className="text-left">
            <p className={`text-sm font-bold ${totalFunds >= 0 ? "text-accent" : "text-destructive"}`}>
              ₹{totalFunds.toLocaleString()}
            </p>
          </div>
          <Plus className="h-3 w-3 text-muted-foreground ml-1" />
        </button>
      </div>

      {/* Month Selector */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={goToPrevMonth} className="h-8 w-8">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
        <Button variant="outline" size="icon" onClick={goToNextMonth} disabled={isCurrentMonth} className="h-8 w-8">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Expenses Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyExpenses}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip />
                <Bar dataKey="expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Dialog open={capitalModalOpen} onOpenChange={setCapitalModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Capital</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Amount (₹)</label>
              <Input type="number" placeholder="Enter amount" value={capitalAmount} onChange={(e) => setCapitalAmount(e.target.value)} min="0" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Note (optional)</label>
              <Input placeholder="e.g. Investor funding, personal savings" value={capitalNote} onChange={(e) => setCapitalNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCapitalModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCapital} disabled={submitting}>{submitting ? "Adding..." : "Add Capital"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
