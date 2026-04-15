import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

const MenuItems = () => {
  const { toast } = useToast();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [itemForm, setItemForm] = useState({ name: "", price: "" });
  const [catForm, setCatForm] = useState({ name: "", type: "expense" });

  useEffect(() => {
    fetchMenuItems();
    fetchCategories();
  }, []);

  const fetchMenuItems = async () => {
    const { data } = await supabase.from("menu_items").select("*").order("name");
    setMenuItems(data || []);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from("categories").select("*").order("name");
    setCategories(data || []);
  };

  // Menu items CRUD
  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: itemForm.name, price: Number(itemForm.price) };

    if (editingItem) {
      const { error } = await supabase.from("menu_items").update(payload).eq("id", editingItem.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("menu_items").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    setItemDialogOpen(false);
    setEditingItem(null);
    setItemForm({ name: "", price: "" });
    fetchMenuItems();
  };

  const handleEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemForm({ name: item.name, price: String(item.price) });
    setItemDialogOpen(true);
  };

  const handleDeleteItem = async (id: string) => {
    await supabase.from("menu_items").delete().eq("id", id);
    fetchMenuItems();
  };

  const handleToggleItem = async (item: MenuItem) => {
    await supabase.from("menu_items").update({ is_active: !item.is_active }).eq("id", item.id);
    fetchMenuItems();
  };

  // Categories CRUD
  const handleCatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: catForm.name, type: catForm.type };

    if (editingCat) {
      const { error } = await supabase.from("categories").update(payload).eq("id", editingCat.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("categories").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }
    setCatDialogOpen(false);
    setEditingCat(null);
    setCatForm({ name: "", type: "expense" });
    fetchCategories();
  };

  const handleEditCat = (cat: Category) => {
    setEditingCat(cat);
    setCatForm({ name: cat.name, type: cat.type });
    setCatDialogOpen(true);
  };

  const handleDeleteCat = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      toast({ title: "Cannot delete", description: "Category is in use by expenses.", variant: "destructive" });
      return;
    }
    fetchCategories();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-serif font-semibold tracking-tight">Items & Categories</h1>

      <Tabs defaultValue="menu">
        <TabsList>
          <TabsTrigger value="menu">Menu Items</TabsTrigger>
          <TabsTrigger value="categories">Expense Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="menu" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={itemDialogOpen} onOpenChange={(o) => { setItemDialogOpen(o); if (!o) setEditingItem(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Item</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingItem ? "Edit Item" : "New Menu Item"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleItemSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Item Name</Label>
                    <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="e.g. Samosa, Fried Rice" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Default Price (₹)</Label>
                    <Input type="number" step="0.01" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} required />
                  </div>
                  <Button type="submit" className="w-full">{editingItem ? "Update" : "Add"} Item</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Price (₹)</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {menuItems.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No menu items yet</TableCell></TableRow>
                  ) : (
                    menuItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-right">₹{Number(item.price).toLocaleString()}</TableCell>
                        <TableCell>
                          <Switch checked={item.is_active} onCheckedChange={() => handleToggleItem(item)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditItem(item)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={catDialogOpen} onOpenChange={(o) => { setCatDialogOpen(o); if (!o) setEditingCat(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Category</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCat ? "Edit Category" : "New Category"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCatSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Category Name</Label>
                    <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="e.g. Rent, Utilities, Grocery" required />
                  </div>
                  <Button type="submit" className="w-full">{editingCat ? "Update" : "Add"} Category</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">No categories yet</TableCell></TableRow>
                  ) : (
                    categories.map((cat) => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-medium">{cat.name}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditCat(cat)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteCat(cat.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default MenuItems;
