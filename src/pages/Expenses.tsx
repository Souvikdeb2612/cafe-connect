import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, parse } from "date-fns";
import MonthFilter from "@/components/MonthFilter";

interface Expense {
  id: string;
  amount: number;
  date: string;
  notes: string | null;
  category_id: string | null;
  outlet_id?: string;
  categories?: { name: string };
  outlets?: { name: string };
}

interface ExpenseRow extends Expense {
  entryCount: number;
}

export const buildExpenseRows = (data: Expense[] | null | undefined, selectedOutletId: string | null) => {
  const grouped = new Map<string, ExpenseRow>();

  for (const expense of data || []) {
    const outletKey = expense.outlet_id || expense.outlets?.name || selectedOutletId || "unknown-outlet";
    const categoryKey = expense.category_id || expense.categories?.name || "uncategorized";
    const key = JSON.stringify([expense.date, outletKey, categoryKey]);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...expense,
        amount: Number(expense.amount),
        entryCount: 1,
      });
      continue;
    }

    existing.amount += Number(expense.amount);
    existing.notes = [existing.notes, expense.notes].filter(Boolean).join(", ");
    existing.entryCount += 1;
    existing.id = `group:${key}`;
  }

  return Array.from(grouped.values()).sort((a, b) => b.date.localeCompare(a.date));
};

interface Category {
  id: string;
  name: string;
}

const Expenses = () => {
  const { selectedOutletId } = useOutlet();
  const { user, isAdmin, roles } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [form, setForm] = useState({ category_id: "", amount: "", date: format(new Date(), "yyyy-MM-dd"), notes: "" });

  const canEdit = isAdmin || roles.includes("outlet_manager");
  const showOutletColumn = selectedOutletId === "all";
  const showActions = canEdit && selectedOutletId !== "all";

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedOutletId) fetchExpenses();
  }, [selectedOutletId, selectedMonth]);

  const fetchCategories = async () => {
    const { data } = await supabase.from("categories").select("id, name").eq("type", "expense").order("name");
    setCategories(data || []);
  };

  const fetchExpenses = async () => {
    let query = supabase
      .from("expenses")
      .select("*, categories(name), outlets(name)")
      .order("date", { ascending: false });

    if (selectedOutletId && selectedOutletId !== "all") {
      query = query.eq("outlet_id", selectedOutletId);
    }

    if (selectedMonth !== "all") {
      const monthDate = parse(selectedMonth, "yyyy-MM", new Date());
      query = query
        .gte("date", format(startOfMonth(monthDate), "yyyy-MM-dd"))
        .lte("date", format(endOfMonth(monthDate), "yyyy-MM-dd"));
    }

    const { data, error } = await query;
    if (error) {
      toast({ title: "Error loading expenses", description: error.message, variant: "destructive" });
      return;
    }
    setExpenses(buildExpenseRows(data as Expense[] | null, selectedOutletId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      outlet_id: selectedOutletId!,
      category_id: form.category_id || null,
      amount: Number(form.amount),
      date: form.date,
      notes: form.notes,
      created_by: user?.id,
    };

    if (editing) {
      const { error } = await supabase.from("expenses").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("expenses").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    setDialogOpen(false);
    setEditing(null);
    setForm({ category_id: "", amount: "", date: format(new Date(), "yyyy-MM-dd"), notes: "" });
    fetchExpenses();
  };

  const handleEdit = (e: Expense) => {
    setEditing(e);
    setForm({ category_id: e.category_id || "", amount: String(e.amount), date: e.date, notes: e.notes || "" });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from("expenses").delete().eq("id", deletingId);
    if (error) {
      toast({ title: "Error deleting expense", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Expense deleted" });
      fetchExpenses();
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-serif font-semibold tracking-tight">Expenses</h1>
          <MonthFilter value={selectedMonth} onChange={setSelectedMonth} />
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button disabled={!selectedOutletId || selectedOutletId === "all"}><Plus className="h-4 w-4 mr-2" />Add Expense</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Expense" : "New Expense"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (₹)</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button type="submit" className="w-full">{editing ? "Update" : "Add"} Expense</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                {showOutletColumn && <TableHead>Outlet</TableHead>}
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Notes</TableHead>
                {showActions && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 ? (
                <TableRow><TableCell colSpan={4 + (showOutletColumn ? 1 : 0) + (showActions ? 1 : 0)} className="text-center text-muted-foreground py-8">No expenses yet</TableCell></TableRow>
              ) : (
                expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                    {showOutletColumn && <TableCell>{e.outlets?.name || "—"}</TableCell>}
                    <TableCell>{e.categories?.name || "—"}</TableCell>
                    <TableCell className="text-right font-medium">₹{Number(e.amount).toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.notes || "—"}</TableCell>
                    {showActions && (
                      <TableCell>
                        {e.entryCount === 1 && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(e)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeletingId(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Expenses;
