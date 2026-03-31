import { useState } from "react";
import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGroceries,
  useCreateGrocery,
  useUpdateGrocery,
  useDeleteGrocery,
} from "@/hooks/useGroceries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface GroceryPurchase {
  id: string;
  item_name: string;
  quantity: number;
  unit: string;
  cost: number;
  date: string;
  notes: string;
}

const Groceries = () => {
  const { selectedOutletId } = useOutlet();
  const { user, isAdmin, roles } = useAuth();
  const { toast } = useToast();
  const { data: purchases = [] } = useGroceries(selectedOutletId);
  const createGrocery = useCreateGrocery();
  const updateGrocery = useUpdateGrocery();
  const deleteGrocery = useDeleteGrocery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GroceryPurchase | null>(null);
  const [form, setForm] = useState({
    item_name: "",
    quantity: "",
    unit: "",
    cost: "",
    date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });

  const canEdit = isAdmin || roles.includes("outlet_manager");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      outlet_id: selectedOutletId!,
      item_name: form.item_name,
      quantity: Number(form.quantity),
      unit: form.unit,
      cost: Number(form.cost),
      date: form.date,
      notes: form.notes,
      created_by: user?.id,
    };

    try {
      if (editing) {
        await updateGrocery.mutateAsync({ ...payload, id: editing.id });
        toast({ title: "Purchase updated successfully" });
      } else {
        await createGrocery.mutateAsync(payload);
        toast({ title: "Purchase added successfully" });
      }
      setDialogOpen(false);
      setEditing(null);
      setForm({
        item_name: "",
        quantity: "",
        unit: "",
        cost: "",
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

  const handleEdit = (p: GroceryPurchase) => {
    setEditing(p);
    setForm({
      item_name: p.item_name,
      quantity: String(p.quantity),
      unit: p.unit || "",
      cost: String(p.cost),
      date: p.date,
      notes: p.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGrocery.mutateAsync(id);
      toast({ title: "Purchase deleted successfully" });
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
        <h1 className="text-xl sm:text-2xl font-bold">Grocery Purchases</h1>
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
              Add Purchase
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit Purchase" : "New Purchase"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Item Name</Label>
                  <Input
                    value={form.item_name}
                    onChange={(e) =>
                      setForm({ ...form, item_name: e.target.value })
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
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.quantity}
                    onChange={(e) =>
                      setForm({ ...form, quantity: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Input
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="kg, pcs, etc."
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Cost (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.cost}
                    onChange={(e) => setForm({ ...form, cost: e.target.value })}
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
                {editing ? "Update" : "Add"} Purchase
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                {canEdit && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canEdit ? 6 : 5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No purchases yet
                  </TableCell>
                </TableRow>
              ) : (
                purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {format(new Date(p.date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="font-medium">{p.item_name}</TableCell>
                    <TableCell>{p.quantity}</TableCell>
                    <TableCell>{p.unit}</TableCell>
                    <TableCell className="text-right">
                      ₹{Number(p.cost).toLocaleString()}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(p)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(p.id)}
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

export default Groceries;
