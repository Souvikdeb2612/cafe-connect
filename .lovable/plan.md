

# Sales & Expenses Intelligence

## What We're Building

Two new pages providing analytical insights into sales and expense data:

### 1. Sales Intelligence Page (`/sales-intelligence`)
- **Top Selling Items** — Ranked table of menu items by total revenue and quantity sold for the selected month
- **Daily Sales Heatmap** — Visual grid showing high/low sales days at a glance
- **Sales by Day of Week** — Bar chart showing which weekdays perform best
- **Revenue per Item** — Horizontal bar chart of average revenue contribution per menu item
- **Month-over-Month Growth** — Percentage change card comparing current vs previous month

### 2. Expenses Intelligence Page (`/expenses-intelligence`)
- **Expense Category Breakdown** — Pie/donut chart showing spend distribution by category (Grocery, Capital, etc.)
- **Top Expense Items** — Ranked list of most frequently purchased expense items with total spend
- **Daily Expense Pattern** — Line chart of daily expense amounts for the month
- **Category Trend** — Stacked area chart showing category-wise spend over the last 6 months
- **Month-over-Month Comparison** — Percentage change card for total expenses

### Shared Features
- Month selector (reuse existing pattern)
- Outlet filter (reuse existing `useOutlet` context)
- Claude-inspired warm parchment design system (already in place)

## Technical Details

### Files to Create
- `src/pages/SalesIntelligence.tsx` — Sales analytics page
- `src/pages/ExpensesIntelligence.tsx` — Expenses analytics page

### Files to Modify
- `src/App.tsx` — Add routes `/sales-intelligence` and `/expenses-intelligence`
- `src/components/AppSidebar.tsx` — Add nav links under a collapsible "Intelligence" section

### Data Queries
- Sales intelligence queries `sales` + `sale_items` tables, grouped/aggregated client-side
- Expenses intelligence queries `expenses` table, grouped by `category` and item names parsed from `notes`
- All queries respect the existing outlet filter and month selection patterns
- Uses Recharts (already installed) for all visualizations

