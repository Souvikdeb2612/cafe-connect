import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutlet } from "@/contexts/OutletContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import MonthFilter from "@/components/MonthFilter";
import { format, startOfMonth, endOfMonth, parse, subMonths } from "date-fns";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";

const COLORS = [
  "hsl(18 55% 52%)",
  "hsl(152 40% 38%)",
  "hsl(40 80% 50%)",
  "hsl(0 50% 45%)",
  "hsl(200 50% 50%)",
  "hsl(280 40% 55%)",
  "hsl(330 45% 50%)",
  "hsl(60 50% 45%)",
];

const tooltipStyle = {
  backgroundColor: "hsl(43 33% 97%)",
  border: "1px solid hsl(40 20% 91%)",
  borderRadius: "8px",
  color: "hsl(60 4% 9%)",
  fontSize: "13px",
  boxShadow: "rgba(0,0,0,0.05) 0px 4px 24px",
};

interface ExpenseRow {
  id: string;
  amount: number;
  date: string;
  notes: string;
  category_id: string;
  categories?: { name: string };
}

const ExpensesIntelligence = () => {
  const { selectedOutletId } = useOutlet();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [prevMonthTotal, setPrevMonthTotal] = useState(0);
  const [categoryTrend, setCategoryTrend] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const isAll = selectedOutletId === "all";

  useEffect(() => {
    if (!selectedOutletId) return;
    fetchData();
    fetchCategoryTrend();
  }, [selectedOutletId, selectedMonth]);

  const getMonthRange = () => {
    if (selectedMonth === "all") return { monthStart: "2000-01-01", monthEnd: "2099-12-31", monthDate: new Date() };
    const monthDate = parse(selectedMonth, "yyyy-MM", new Date());
    return {
      monthStart: format(startOfMonth(monthDate), "yyyy-MM-dd"),
      monthEnd: format(endOfMonth(monthDate), "yyyy-MM-dd"),
      monthDate,
    };
  };

  const applyOutletFilter = (q: any) => {
    if (!isAll && selectedOutletId) return q.eq("outlet_id", selectedOutletId);
    return q;
  };

  const fetchData = async () => {
    setLoading(true);
    const { monthStart, monthEnd, monthDate } = getMonthRange();

    let q = supabase.from("expenses").select("*, categories(name)").gte("date", monthStart).lte("date", monthEnd);
    q = applyOutletFilter(q);
    const { data } = await q;
    setExpenses(data || []);

    // Prev month
    if (selectedMonth !== "all") {
      const prev = subMonths(monthDate, 1);
      let prevQ = supabase
        .from("expenses")
        .select("amount")
        .gte("date", format(startOfMonth(prev), "yyyy-MM-dd"))
        .lte("date", format(endOfMonth(prev), "yyyy-MM-dd"));
      prevQ = applyOutletFilter(prevQ);
      const { data: prevData } = await prevQ;
      setPrevMonthTotal((prevData || []).reduce((s, r) => s + Number(r.amount), 0));
    } else {
      setPrevMonthTotal(0);
    }
    setLoading(false);
  };

  const fetchCategoryTrend = async () => {
    const { monthDate } = getMonthRange();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(selectedMonth === "all" ? new Date() : monthDate, 5 - i);
      return {
        start: format(startOfMonth(d), "yyyy-MM-dd"),
        end: format(endOfMonth(d), "yyyy-MM-dd"),
        label: format(d, "MMM"),
      };
    });

    const results = await Promise.all(
      months.map(async (m) => {
        let q = supabase.from("expenses").select("amount, categories(name)").gte("date", m.start).lte("date", m.end);
        q = applyOutletFilter(q);
        const { data } = await q;
        const catMap: Record<string, number> = {};
        (data || []).forEach((e: any) => {
          const cat = e.categories?.name || "Uncategorized";
          catMap[cat] = (catMap[cat] || 0) + Number(e.amount);
        });
        return { name: m.label, ...catMap };
      })
    );
    setCategoryTrend(results);
  };

  const currentTotal = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);

  const momGrowth = useMemo(() => {
    if (selectedMonth === "all" || prevMonthTotal === 0) return null;
    return ((currentTotal - prevMonthTotal) / prevMonthTotal) * 100;
  }, [currentTotal, prevMonthTotal, selectedMonth]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      const cat = e.categories?.name || "Uncategorized";
      map[cat] = (map[cat] || 0) + Number(e.amount);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  // Top expense items from notes
  const topExpenseItems = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    expenses.forEach((e) => {
      if (!e.notes) return;
      // Parse individual items from notes (format: "Item @price\nItem @price")
      const lines = e.notes.split(/\n|,/).map((l) => l.trim()).filter(Boolean);
      lines.forEach((line) => {
        const match = line.match(/^(.+?)[\s]*[@₹]?\s*(\d+(?:\.\d+)?)\s*$/);
        if (match) {
          const name = match[1].trim().toLowerCase();
          const amount = parseFloat(match[2]);
          if (!map[name]) map[name] = { count: 0, total: 0 };
          map[name].count += 1;
          map[name].total += amount;
        }
      });
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), ...d }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [expenses]);

  // Daily expense pattern
  const dailyPattern = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      map[e.date] = (map[e.date] || 0) + Number(e.amount);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({
        name: format(new Date(date), "dd"),
        amount,
      }));
  }, [expenses]);

  // All category names for trend chart
  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    categoryTrend.forEach((row) => {
      Object.keys(row).forEach((k) => {
        if (k !== "name") cats.add(k);
      });
    });
    return Array.from(cats);
  }, [categoryTrend]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-3xl font-serif font-semibold tracking-tight">Expenses Intelligence</h1>
        <MonthFilter value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      {/* MoM Growth */}
      {momGrowth !== null && (
        <Card className="shadow-ring border-0">
          <CardContent className="flex items-center gap-4 py-5">
            {momGrowth <= 0 ? (
              <TrendingDown className="h-8 w-8 text-success" />
            ) : (
              <TrendingUp className="h-8 w-8 text-destructive" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Month-over-Month Change</p>
              <p className={`text-2xl font-serif font-semibold ${momGrowth <= 0 ? "text-success" : "text-destructive"}`}>
                {momGrowth >= 0 ? "+" : ""}
                {momGrowth.toFixed(1)}%
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <span>₹{prevMonthTotal.toLocaleString()}</span>
              <ArrowRight className="h-4 w-4" />
              <span className="font-medium text-foreground">₹{currentTotal.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category Breakdown Pie */}
        <Card className="shadow-ring border-0">
          <CardHeader>
            <CardTitle className="text-base font-serif">Expense Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No data</p>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {categoryBreakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [`₹${v.toLocaleString()}`, "Amount"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-2 justify-center">
                  {categoryBreakdown.map((cat, i) => (
                    <div key={cat.name} className="flex items-center gap-1.5 text-xs">
                      <div
                        className="h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-muted-foreground">{cat.name}</span>
                      <span className="font-medium">₹{cat.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Expense Pattern */}
        <Card className="shadow-ring border-0">
          <CardHeader>
            <CardTitle className="text-base font-serif">Daily Expense Pattern</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyPattern}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 20% 91%)" />
                <XAxis dataKey="name" stroke="hsl(48 4% 50%)" fontSize={12} />
                <YAxis stroke="hsl(48 4% 50%)" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v.toLocaleString()}`, "Expenses"]} />
                <Line type="monotone" dataKey="amount" stroke="hsl(0 50% 45%)" strokeWidth={2} dot={{ fill: "hsl(0 50% 45%)", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Expense Items */}
        <Card className="shadow-ring border-0">
          <CardHeader>
            <CardTitle className="text-base font-serif">Top Expense Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">#</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right pr-6">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topExpenseItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No item data found in notes
                    </TableCell>
                  </TableRow>
                ) : (
                  topExpenseItems.map((item, i) => (
                    <TableRow key={item.name}>
                      <TableCell className="pl-6 text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                      <TableCell className="text-right pr-6 font-medium">₹{item.total.toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Category Trend */}
        <Card className="shadow-ring border-0">
          <CardHeader>
            <CardTitle className="text-base font-serif">6-Month Category Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={categoryTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 20% 91%)" />
                <XAxis dataKey="name" stroke="hsl(48 4% 50%)" fontSize={12} />
                <YAxis stroke="hsl(48 4% 50%)" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v.toLocaleString()}`]} />
                {allCategories.map((cat, i) => (
                  <Area
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stackId="1"
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.4}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExpensesIntelligence;
