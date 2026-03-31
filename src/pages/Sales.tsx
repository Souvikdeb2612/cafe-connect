import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, X } from "lucide-react";
import { format } from "date-fns";

interface SaleItem {
  item_name: string;
  quantity: number;
  price: number;
}

interface Sale {
  id: string;
  date: string;
  total_revenue: number;
  notes: string;
  sale_items: SaleItem[];
}

const Sales = () => {
  const { selectedOutletId } = useOutlet();
  const { user } = useAuth();
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SaleItem[]>([{ item_name: "", quantity: 1, price: 0 }]);

  useEffect(() => {
    if (selectedOutletId) fetchSales();
  }, [selectedOutletId]);

  const fetchSales = async () => {
    const { data } = await supabase
      .from("sales")
      .select("*, sale_items(*)")
      .eq("outlet_id", selectedOutletId)
      .order("date", { ascending: false });
    setSales(data || []);
  };

  const addItem = () => setItems([...items, { item_name: "", quantity: 1, price: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof SaleItem, value: any) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const totalRevenue = items.reduce((s, it) => s + it.quantity * it.price, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((it) => it.item_name.trim());
    if (validItems.length === 0) { toast({ title: "Add at least one item", variant: "destructive" }); return; }

    const { data: sale, error } = await supabase
      .from("sales")
      .insert({ outlet_id: selectedOutletId!, date, total_revenue: totalRevenue, notes, created_by: user?.id })
      .select()
      .single();

    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

    await supabase.from("sale_items").insert(
      validItems.map((it) => ({ sale_id: sale.id, item_name: it.item_name, quantity: it.quantity, price: it.price }))
    );

    setDialogOpen(false);
    setItems([{ item_name: "", quantity: 1, price: 0 }]);
    setNotes("");
    fetchSales();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sales</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Sale</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Record Sale</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Items Sold</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-3 w-3 mr-1" />Add Item
                  </Button>
                </div>
                {items.map((item, i) => (
                  <div key={i} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input placeholder="Item name" value={item.item_name} onChange={(e) => updateItem(i, "item_name", e.target.value)} />
                    </div>
                    <div className="w-20">
                      <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(i, "quantity", Number(e.target.value))} />
                    </div>
                    <div className="w-24">
                      <Input type="number" step="0.01" placeholder="Price" value={item.price} onChange={(e) => updateItem(i, "price", Number(e.target.value))} />
                    </div>
                    {items.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <div className="text-right font-semibold">Total: ₹{totalRevenue.toLocaleString()}</div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Button type="submit" className="w-full">Record Sale</Button>
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
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No sales recorded</TableCell></TableRow>
              ) : (
                sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{format(new Date(s.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(s.sale_items || []).map((it) => `${it.item_name} ×${it.quantity}`).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">₹{Number(s.total_revenue).toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.notes || "—"}</TableCell>
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

export default Sales;
