

# Cafe Business Management System

## Overview
Internal web app for managing a multi-outlet cafe business — tracking groceries, sales, expenses, and performance dashboards. Built with React + Supabase.

## Database Schema

### Tables
1. **outlets** — id, name, address, phone, is_active, created_at
2. **profiles** — id (FK auth.users), full_name, email, created_at
3. **user_roles** — id, user_id, role (enum: admin, outlet_manager, staff)
4. **user_outlets** — id, user_id, outlet_id (assignment junction table)
5. **categories** — id, name, type (enum: expense, grocery, menu_item)
6. **grocery_purchases** — id, outlet_id, item_name, quantity, unit, cost, date, notes, created_by
7. **sales** — id, outlet_id, date, total_revenue, notes, created_by
8. **sale_items** — id, sale_id, item_name, quantity, price
9. **expenses** — id, outlet_id, category_id, amount, date, notes, created_by

### RLS Strategy
- Security definer function `has_role(user_id, role)` to avoid recursion
- Security definer function `user_has_outlet_access(user_id, outlet_id)` checking admin role OR user_outlets assignment
- All data tables use `user_has_outlet_access` in RLS policies
- Staff: INSERT + SELECT only; Managers: full CRUD on assigned outlets; Admin: full access everywhere

## Frontend Pages

### Auth
- **Login page** — email/password via Supabase Auth
- Auth guard redirecting unauthenticated users

### Navigation
- Sidebar with role-aware menu items
- Outlet selector dropdown (filtered by user assignment; admins see all)

### Core Pages
1. **Dashboard** — KPI cards (today's sales, expenses, grocery costs, profit), charts for trends, outlet comparison (admin only)
2. **Grocery Tracking** — table of purchases with date/outlet filters, add/edit purchase form
3. **Sales Entry** — daily sales form with line items for food sold, sales history table
4. **Expenses** — expense list with category filters, add/edit expense form
5. **Outlets Management** (admin) — CRUD outlets
6. **User Management** (admin) — invite users, assign roles and outlets

### Dashboard Details
- **Outlet Dashboard**: daily/monthly sales, grocery costs, expenses, profit/loss calculation
- **Central Dashboard** (admin): cross-outlet comparison bar charts, expense trend lines, top-performing outlet highlight

## Implementation Approach
- Supabase Cloud via Lovable integration for auth, database, and RLS
- React Query for data fetching with pagination
- Recharts for dashboard visualizations
- Date-fns for date handling
- Modular component structure: each module (grocery, sales, expenses) as its own folder
- Indexes on outlet_id and date columns for query performance

