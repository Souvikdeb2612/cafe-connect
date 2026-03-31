import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import OutletSelector from "./OutletSelector";
import {
  LayoutDashboard,
  ShoppingBasket,
  DollarSign,
  Receipt,
  Building2,
  Users,
  LogOut,
  Coffee,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/groceries", icon: ShoppingBasket, label: "Groceries" },
  { to: "/sales", icon: DollarSign, label: "Sales" },
  { to: "/expenses", icon: Receipt, label: "Expenses" },
];

const adminItems = [
  { to: "/outlets", icon: Building2, label: "Outlets" },
  { to: "/users", icon: Users, label: "Users" },
];

const AppSidebar = () => {
  const { isAdmin, signOut, user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const linkClass = (path: string) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
      location.pathname === path
        ? "bg-primary/15 text-primary border-l-2 border-primary shadow-sm shadow-primary/10"
        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground border-l-2 border-transparent"
    );

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Coffee className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold text-sidebar-foreground">Cafe Manager</span>
      </div>

      <div className="px-2 pb-4">
        <OutletSelector />
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass(item.to)} onClick={() => setOpen(false)}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="my-3 border-t border-sidebar-border" />
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              Admin
            </p>
            {adminItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass(item.to)} onClick={() => setOpen(false)}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 truncate px-3 text-xs text-sidebar-foreground/50">{user?.email}</div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden"
        onClick={() => setOpen(!open)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-sidebar-background border-r border-sidebar-border transition-transform md:translate-x-0 md:static md:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
