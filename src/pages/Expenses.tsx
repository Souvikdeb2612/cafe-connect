import { useState } from "react";
import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCategories,
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
} from "@/hooks/useExpenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface Expense {
  id: string;
  amount: number;
  date: string;
  notes: string;
  category_id: string;
  categories?: { name: string };
}

interface Category {
  id: string;
  name: string;
}

const Expenses = () => {
  const { selectedOutletId } = useOutlet();
  const { user, isAdmin, roles } = useAuth();
  const { toast } = useToast();
  const { data: categories = [] } = useCategories();
  const { data: expenses = [] } = useExpenses(selectedOutletId);
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({
    category_id: "",
    amount: "",
    date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });

  const canEdit = isAdmin || roles.includes("outlet_manager");

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

    try {
      if (editing) {
        await updateExpense.mutateAsync({ ...payload, id: editing.id });
        toast({ title: "Expense updated successfully" });
      } else {
        await createExpense.mutateAsync(payload);
        toast({ title: "Expense added successfully" });
      }
      setDialogOpen(false);
      setEditing(null);
      setForm({
        category_id: "",
        amount: "",
        date: format(new Date(), "yyyy-MM-dd"),
        notes: "",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      category_id: e.category_id || "",
      amount: String(e.amount),
      date: e.date,
      notes: e.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteExpense.mutateAsync(id);
      toast({ title: "Expense deleted successfully" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold">Expenses</h1>
        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit Expense" : "New Expense"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(v) => setForm({ ...form, category_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">
                {editing ? "Update" : "Add"} Expense
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[500px]">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Notes</TableHead>
                {canEdit && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canEdit ? 5 : 4}
                    className="text-center text-muted-foreground py-8"
                  >
                    No expenses yet
                  </TableCell>
                </TableRow>
              ) : (
                expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      {format(new Date(e.date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>{e.categories?.name || "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      ₹{Number(e.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.notes || "—"}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(e)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(e.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Expenses;
