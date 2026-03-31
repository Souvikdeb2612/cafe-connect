import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

interface UserWithRole {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
  outlet_ids: string[];
}

interface Outlet {
  id: string;
  name: string;
}

const UserManagement = () => {
  const { toast } = useToast();
  const { user: currentUser, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [newRole, setNewRole] = useState("");
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && currentUser) {
      fetchUsers();
      fetchOutlets();
    }
  }, [authLoading, currentUser]);

  const fetchOutlets = async () => {
    const { data } = await supabase
      .from("outlets")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setOutlets(data || []);
  };

  const fetchUsers = async () => {
    setLoading(true);

    // Fetch all profiles (which should contain all users via trigger)
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, email");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      toast({
        title: "Error loading users",
        description: profilesError.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");
    const { data: userOutlets } = await supabase
      .from("user_outlets")
      .select("user_id, outlet_id");

    const enriched = (profiles || []).map((p) => ({
      id: p.id,
      email: p.email || "",
      full_name: p.full_name || "",
      roles: (roles || []).filter((r) => r.user_id === p.id).map((r) => r.role),
      outlet_ids: (userOutlets || [])
        .filter((uo) => uo.user_id === p.id)
        .map((uo) => uo.outlet_id),
    }));
    setUsers(enriched);
    setLoading(false);
  };

  const handleManage = (u: UserWithRole) => {
    setSelectedUser(u);
    setNewRole(u.roles[0] || "staff");
    setSelectedOutlets(u.outlet_ids);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedUser) return;

    // Update role
    await supabase.from("user_roles").delete().eq("user_id", selectedUser.id);
    if (newRole) {
      await supabase
        .from("user_roles")
        .insert({ user_id: selectedUser.id, role: newRole });
    }

    // Update outlet assignments
    await supabase.from("user_outlets").delete().eq("user_id", selectedUser.id);
    if (selectedOutlets.length > 0) {
      await supabase.from("user_outlets").insert(
        selectedOutlets.map((oid) => ({
          user_id: selectedUser.id,
          outlet_id: oid,
        })),
      );
    }

    setDialogOpen(false);
    fetchUsers();
    toast({ title: "User updated" });
  };

  const toggleOutlet = (outletId: string) => {
    setSelectedOutlets((prev) =>
      prev.includes(outletId)
        ? prev.filter((id) => id !== outletId)
        : [...prev, outletId],
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold">User Management</h1>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[500px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Outlets</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.full_name || "—"}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      {u.roles.map((r) => (
                        <Badge
                          key={r}
                          variant={r === "admin" ? "default" : "secondary"}
                          className="mr-1"
                        >
                          {r}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.roles.includes("admin")
                        ? "All"
                        : outlets
                            .filter((o) => u.outlet_ids.includes(o.id))
                            .map((o) => o.name)
                            .join(", ") || "None"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleManage(u)}
                      >
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Manage {selectedUser?.full_name || selectedUser?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="outlet_manager">Outlet Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newRole !== "admin" && (
              <div className="space-y-2">
                <Label>Assigned Outlets</Label>
                <div className="space-y-2 max-h-48 overflow-auto">
                  {outlets.map((o) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedOutlets.includes(o.id)}
                        onCheckedChange={() => toggleOutlet(o.id)}
                      />
                      <span className="text-sm">{o.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={handleSave} className="w-full">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;
