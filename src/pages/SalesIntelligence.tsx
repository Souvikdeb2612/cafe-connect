import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutlet } from "@/contexts/OutletContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import MonthFilter from "@/components/MonthFilter";
import { format, startOfMonth, endOfMonth, parse, subMonths, getDay } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const tooltipStyle = {
  backgroundColor: "hsl(43 33% 97%)",
  border: "1px solid hsl(40 20% 91%)",
  borderRadius: "8px",
  color: "hsl(60 4% 9%)",
  fontSize: "13px",
  boxShadow: "rgba(0,0,0,0.05) 0px 4px 24px",
};

interface SaleItemRow {
  item_name: string;
  quantity: number;
  price: number;
  sale_id: string;
}

interface SaleRow {
  id: string;
  date: string;
  total_revenue: number;
  outlet_id: string;
}

const SalesIntelligence = () => {
  const { selectedOutletId } = useOutlet();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItemRow[]>([]);
  const [prevMonthTotal, setPrevMonthTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const isAll = selectedOutletId === "all";

  useEffect(() => {
    if (!selectedOutletId) return;
    fetchData();
  }, [selectedOutletId, selectedMonth]);

  const fetchData = async () => {
    setLoading(true);

    // Current month
    let monthDate: Date;
    let monthStart: string;
    let monthEnd: string;

    if (selectedMonth === "all") {
      monthDate = new Date();
      monthStart = "2000-01-01";
      monthEnd = "2099-12-31";
    } else {
      monthDate = parse(selectedMonth, "yyyy-MM", new Date());
      monthStart = format(startOfMonth(monthDate), "yyyy-MM-dd");
      monthEnd = format(endOfMonth(monthDate), "yyyy-MM-dd");
    }

    // Fetch sales for current month
    let salesQ = supabase.from("sales").select("id, date, total_revenue, outlet_id").gte("date", monthStart).lte("date", monthEnd);
    if (!isAll && selectedOutletId) salesQ = salesQ.eq("outlet_id", selectedOutletId);
    const { data: salesData } = await salesQ;
    setSales(salesData || []);

    // Fetch sale items for those sales
    const saleIds = (salesData || []).map((s) => s.id);
    if (saleIds.length > 0) {
      const { data: itemsData } = await supabase
        .from("sale_items")
        .select("item_name, quantity, price, sale_id")
        .in("sale_id", saleIds);
      setSaleItems(itemsData || []);
    } else {
      setSaleItems([]);
    }

    // Prev month total for MoM
    if (selectedMonth !== "all") {
      const prev = subMonths(monthDate, 1);
      const prevStart = format(startOfMonth(prev), "yyyy-MM-dd");
      const prevEnd = format(endOfMonth(prev), "yyyy-MM-dd");
      let prevQ = supabase.from("sales").select("total_revenue").gte("date", prevStart).lte("date", prevEnd);
      if (!isAll && selectedOutletId) prevQ = prevQ.eq("outlet_id", selectedOutletId);
      const { data: prevData } = await prevQ;
      setPrevMonthTotal((prevData || []).reduce((s, r) => s + Number(r.total_revenue), 0));
    } else {
      setPrevMonthTotal(0);
    }

    setLoading(false);
  };

  const currentTotal = useMemo(() => sales.reduce((s, r) => s + Number(r.total_revenue), 0), [sales]);

  const momGrowth = useMemo(() => {
    if (selectedMonth === "all" || prevMonthTotal === 0) return null;
    return ((currentTotal - prevMonthTotal) / prevMonthTotal) * 100;
  }, [currentTotal, prevMonthTotal, selectedMonth]);

  // Top selling items
  const topItems = useMemo(() => {
    const map: Record<string, { qty: number; revenue: number }> = {};
    saleItems.forEach((it) => {
      if (!map[it.item_name]) map[it.item_name] = { qty: 0, revenue: 0 };
      map[it.item_name].qty += it.quantity;
      map[it.item_name].revenue += it.quantity * it.price;
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [saleItems]);

  // Sales by day of week
  const dayOfWeekData = useMemo(() => {
    const map: Record<number, number> = {};
    DAY_NAMES.forEach((_, i) => (map[i] = 0));
    sales.forEach((s) => {
      const day = getDay(new Date(s.date));
      map[day] += Number(s.total_revenue);
    });
    return DAY_NAMES.map((name, i) => ({ name, revenue: map[i] }));
  }, [sales]);

  // Daily sales heatmap data
  const dailySales = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach((s) => {
      map[s.date] = (map[s.date] || 0) + Number(s.total_revenue);
    });
    return Object.entries(map)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sales]);

  const maxDailyRevenue = useMemo(() => Math.max(...dailySales.map((d) => d.revenue), 1), [dailySales]);

  // Revenue per item (horizontal bar)
  const revenuePerItem = useMemo(() => {
    return topItems.slice(0, 10).map((it) => ({
      name: it.name.length > 15 ? it.name.slice(0, 15) + "…" : it.name,
      revenue: it.revenue,
    }));
  }, [topItems]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-3xl font-serif font-semibold tracking-tight">Sales Intelligence</h1>
        <MonthFilter value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      {/* MoM Growth Card */}
      {momGrowth !== null && (
        <Card className="shadow-ring border-0">
          <CardContent className="flex items-center gap-4 py-5">
            {momGrowth >= 0 ? (
              <TrendingUp className="h-8 w-8 text-success" />
            ) : (
              <TrendingDown className="h-8 w-8 text-destructive" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Month-over-Month Growth</p>
              <p className={`text-2xl font-serif font-semibold ${momGrowth >= 0 ? "text-success" : "text-destructive"}`}>
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
        {/* Top Selling Items */}
        <Card className="shadow-ring border-0">
          <CardHeader>
            <CardTitle className="text-base font-serif">Top Selling Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">#</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right pr-6">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No sales data
                    </TableCell>
                  </TableRow>
                ) : (
                  topItems.slice(0, 10).map((item, i) => (
                    <TableRow key={item.name}>
                      <TableCell className="pl-6 text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-right">{item.qty}</TableCell>
                      <TableCell className="text-right pr-6 font-medium">₹{item.revenue.toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sales by Day of Week */}
        <Card className="shadow-ring border-0">
          <CardHeader>
            <CardTitle className="text-base font-serif">Sales by Day of Week</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dayOfWeekData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 20% 91%)" />
                <XAxis dataKey="name" stroke="hsl(48 4% 50%)" fontSize={12} />
                <YAxis stroke="hsl(48 4% 50%)" fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v.toLocaleString()}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(18 55% 52%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue per Item (horizontal bar) */}
        <Card className="shadow-ring border-0">
          <CardHeader>
            <CardTitle className="text-base font-serif">Revenue per Item</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenuePerItem} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(40 20% 91%)" />
                <XAxis type="number" stroke="hsl(48 4% 50%)" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="hsl(48 4% 50%)" fontSize={11} width={120} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v.toLocaleString()}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(18 55% 62%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Daily Sales Heatmap */}
        <Card className="shadow-ring border-0">
          <CardHeader>
            <CardTitle className="text-base font-serif">Daily Sales Heatmap</CardTitle>
          </CardHeader>
          <CardContent>
            {dailySales.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No data</p>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {dailySales.map((d) => {
                  const intensity = d.revenue / maxDailyRevenue;
                  const opacity = 0.15 + intensity * 0.85;
                  return (
                    <div
                      key={d.date}
                      className="aspect-square rounded-md flex flex-col items-center justify-center text-xs"
                      style={{
                        backgroundColor: `hsla(18, 55%, 52%, ${opacity})`,
                        color: intensity > 0.5 ? "hsl(43 33% 97%)" : "hsl(60 4% 9%)",
                      }}
                      title={`${format(new Date(d.date), "dd MMM")}: ₹${d.revenue.toLocaleString()}`}
                    >
                      <span className="font-medium">{format(new Date(d.date), "dd")}</span>
                      <span className="text-[10px] opacity-80">₹{d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : d.revenue}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SalesIntelligence;
