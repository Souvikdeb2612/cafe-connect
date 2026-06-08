import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOutlet } from "@/contexts/OutletContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, parse } from "date-fns";
import MonthFilter from "@/components/MonthFilter";
import {
  buildSaleInsertPayload,
  buildSaleRows,
  buildSaleUpdatePayload,
  resolveSaleOutletId,
  type Sale,
  type SaleItem,
} from "./salesUtils";

interface MenuItem {
  id: string;
  name: string;
  price: number;
}

interface Outlet {
  id: string;
  name: string;
  is_active?: boolean;
}

const Sales = () => {
  const { selectedOutletId } = useOutlet();
  const { user } = useAuth();
  const { toast } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formOutletId, setFormOutletId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SaleItem[]>([{ item_name: "", quantity: 1, price: 0 }]);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  const fetchMenuItems = useCallback(async () => {
    const { data } = await supabase.from("menu_items").select("*").eq("is_active", true).order("name");
    setMenuItems(data || []);
  }, []);

  const fetchOutlets = useCallback(async () => {
    const { data } = await supabase.from("outlets").select("id, name, is_active").order("name");
    setOutlets(data || []);
  }, []);

  const fetchSales = useCallback(async () => {
    let query = supabase
      .from("sales")
      .select("*, sale_items(*), outlets(name)")
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
      toast({ title: "Error loading sales", description: error.message, variant: "destructive" });
      return;
    }

    setSales(buildSaleRows(data as Sale[] | null, selectedOutletId));
  }, [selectedOutletId, selectedMonth, toast]);

  useEffect(() => {
    fetchMenuItems();
    fetchOutlets();
  }, [fetchMenuItems, fetchOutlets]);

  useEffect(() => {
    if (selectedOutletId) fetchSales();
  }, [selectedOutletId, fetchSales]);

  const addItem = () => setItems([...items, { item_name: "", quantity: 1, price: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, updates: Partial<SaleItem>) => {
    setItems(prev => {
      const updated = [...prev];
      updated[i] = { ...updated[i], ...updates };
      return updated;
    });
  };

  const totalRevenue = items.reduce((s, it) => s + it.quantity * it.price, 0);
  const canManageSales = !!selectedOutletId && outlets.length > 0;
  const showOutletColumn = selectedOutletId === "all";
  const tableColumnCount = 4 + (showOutletColumn ? 1 : 0) + (canManageSales ? 1 : 0);

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setFormOutletId(selectedOutletId && selectedOutletId !== "all" ? selectedOutletId : "");
    setItems([{ item_name: "", quantity: 1, price: 0 }]);
    setNotes("");
    setEditingSaleId(null);
  };

  const openEditDialog = (sale: Sale) => {
    setEditingSaleId(sale.id);
    setDate(sale.date);
    setFormOutletId(sale.outlet_id || "");
    setNotes(sale.notes || "");
    setItems(
      sale.sale_items.length > 0
        ? sale.sale_items.map((it) => ({ item_name: it.item_name, quantity: it.quantity, price: it.price }))
        : [{ item_name: "", quantity: 1, price: 0 }]
    );
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!editingSaleId) return;
    const { error } = await supabase.from("sales").delete().eq("id", editingSaleId);
    if (error) {
      toast({ title: "Error deleting sale", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Sale deleted" });
    setDialogOpen(false);
    resetForm();
    fetchSales();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const saleOutletId = resolveSaleOutletId(formOutletId, selectedOutletId);

    if (!saleOutletId) {
      toast({ title: "Select an outlet", variant: "destructive" });
      return;
    }

    const validItems = items.filter((it) => it.item_name.trim());
    if (validItems.length === 0) { toast({ title: "Add at least one item", variant: "destructive" }); return; }

    if (editingSaleId) {
      // Update existing sale, including the outlet in case the sale was recorded against the wrong location.
      const { error } = await supabase
        .from("sales")
        .update(buildSaleUpdatePayload(saleOutletId, date, totalRevenue, notes))
        .eq("id", editingSaleId);

      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

      // Delete old items and re-insert
      const { error: deleteItemsError } = await supabase.from("sale_items").delete().eq("sale_id", editingSaleId);
      if (deleteItemsError) { toast({ title: "Error", description: deleteItemsError.message, variant: "destructive" }); return; }

      const { error: insertItemsError } = await supabase.from("sale_items").insert(
        validItems.map((it) => ({ sale_id: editingSaleId, item_name: it.item_name, quantity: it.quantity, price: it.price }))
      );
      if (insertItemsError) { toast({ title: "Error", description: insertItemsError.message, variant: "destructive" }); return; }
    } else {
      // Create new sale
      const { data: sale, error } = await supabase
        .from("sales")
        .insert(buildSaleInsertPayload(saleOutletId, date, totalRevenue, notes, user?.id))
        .select()
        .single();

      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

      const { error: insertItemsError } = await supabase.from("sale_items").insert(
        validItems.map((it) => ({ sale_id: sale.id, item_name: it.item_name, quantity: it.quantity, price: it.price }))
      );
      if (insertItemsError) { toast({ title: "Error", description: insertItemsError.message, variant: "destructive" }); return; }
    }

    setDialogOpen(false);
    resetForm();
    fetchSales();
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-serif font-semibold tracking-tight">Sales</h1>
          <MonthFilter value={selectedMonth} onChange={setSelectedMonth} />
        </div>
        {!selectedOutletId && (
          <p className="text-sm text-muted-foreground">Select an outlet view to add or edit sales.</p>
        )}
        {selectedOutletId && outlets.length === 0 && (
          <p className="text-sm text-muted-foreground">Add an outlet before recording sales.</p>
        )}
        {canManageSales && (
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />New Sale
          </Button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSaleId ? "Edit Sale" : "Record Sale"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Outlet</Label>
              <Select value={formOutletId} onValueChange={setFormOutletId}>
                <SelectTrigger><SelectValue placeholder="Select outlet" /></SelectTrigger>
                <SelectContent>
                  {outlets.map((outlet) => (
                    <SelectItem key={outlet.id} value={outlet.id}>
                      {outlet.name}{outlet.is_active === false ? " (Inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                    <Select value={item.item_name} onValueChange={(val) => {
                      const menuItem = menuItems.find(m => m.name === val);
                      updateItem(i, { item_name: val, ...(menuItem ? { price: menuItem.price } : {}) });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>
                        {menuItems.map((m) => (
                          <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-20">
                    <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                  </div>
                  <div className="w-24">
                    <Input type="number" step="0.01" placeholder="Price" value={item.price} onChange={(e) => updateItem(i, { price: Number(e.target.value) })} />
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

            <div className="flex gap-2">
              {editingSaleId && (
                <Button type="button" variant="destructive" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />Delete
                </Button>
              )}
              <Button type="submit" className="flex-1">
                {editingSaleId ? "Update Sale" : "Record Sale"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                {showOutletColumn && <TableHead>Outlet</TableHead>}
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead>Notes</TableHead>
                {canManageSales && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow><TableCell colSpan={tableColumnCount} className="text-center text-muted-foreground py-8">No sales recorded</TableCell></TableRow>
              ) : (
                sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{format(new Date(s.date), "dd MMM yyyy")}</TableCell>
                    {showOutletColumn && <TableCell>{s.outlets?.name || "—"}</TableCell>}
                    <TableCell className="text-sm text-muted-foreground">
                      {(s.sale_items || []).map((it) => `${it.item_name} ×${it.quantity}`).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">₹{Number(s.total_revenue).toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.notes || "—"}</TableCell>
                    {canManageSales && (
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
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

export default Sales;
