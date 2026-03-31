import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboardKPIs, useMonthlySales, useOutletComparison } from "@/hooks/useDashboard";
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
  type LucideIcon,
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
import { format } from "date-fns";

const Dashboard = () => {
  const { selectedOutletId, isAllOutletsSelected } = useOutlet();
  const { isAdmin } = useAuth();

  const { data: kpiData, isLoading: kpiLoading } = useDashboardKPIs(
    selectedOutletId,
    isAllOutletsSelected
  );
  const { data: monthlySalesData, isLoading: monthlySalesLoading } = useMonthlySales(
    selectedOutletId,
    isAllOutletsSelected
  );
  const { data: outletComparisonData, isLoading: outletComparisonLoading } = useOutletComparison(
    isAdmin,
    selectedOutletId
  );

  const loading = kpiLoading || monthlySalesLoading || outletComparisonLoading;

  const INITIAL_CASH = 1920;

  const monthSales = kpiData?.monthSales ?? 0;
  const monthExpenses = kpiData?.monthExpenses ?? 0;
  const monthGrocery = kpiData?.monthGrocery ?? 0;
  const totalSales = kpiData?.totalSales ?? 0;
  const totalExpenses = kpiData?.totalExpenses ?? 0;
  const totalGrocery = kpiData?.totalGrocery ?? 0;
  const monthlySales = monthlySalesData ?? [];
  const outletComparison = outletComparisonData ?? [];

  const KPICard = ({
    title,
    value,
    icon: Icon,
    color,
    loading,
  }: {
    title: string;
    value: number;
    icon: LucideIcon;
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
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-row items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Overview for {format(new Date(), "MMMM yyyy")}
            {isAllOutletsSelected ? " — All Outlets" : ""}
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800"
          aria-label={`Available funds: ₹${availableCash.toLocaleString()}`}
        >
          <Wallet
            className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          {loading ? (
            <Skeleton className="h-4 w-16" />
          ) : (
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              ₹{availableCash.toLocaleString()}
            </span>
          )}
        </div>
      </header>

      <section
        aria-label="Key metrics"
        className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4"
      >
        {kpis.map((kpi) => (
          <KPICard key={kpi.title} {...kpi} loading={loading} />
        ))}
      </section>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">
              Monthly Revenue Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px] sm:h-[280px] w-full" />
            ) : monthlySales.length === 0 ? (
              <div className="h-[200px] sm:h-[280px] flex flex-col items-center justify-center text-center text-muted-foreground">
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
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={monthlySales}
                  margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickMargin={5}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickFormatter={(value) => `₹${value / 1000}k`}
                  />
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
            <CardHeader className="pb-2 sm:pb-4">
              <CardTitle className="text-sm sm:text-base">
                Outlet Comparison (This Month)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[200px] sm:h-[280px] w-full" />
              ) : outletComparison.length === 0 ? (
                <div className="h-[200px] sm:h-[280px] flex flex-col items-center justify-center text-center text-muted-foreground">
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
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={outletComparison}
                    margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickMargin={5}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickFormatter={(value) => `₹${value / 1000}k`}
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
