import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOutlet } from "@/contexts/OutletContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Store } from "lucide-react";

interface Outlet {
  id: string;
  name: string;
}

const OutletSelector = () => {
  const { user } = useAuth();
  const { selectedOutletId, setSelectedOutletId } = useOutlet();
  const [outlets, setOutlets] = useState<Outlet[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchOutlets = async () => {
      const { data } = await supabase
        .from("outlets")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (data && data.length > 0) {
        setOutlets(data);
        // Default to "all" if no selection, don't auto-select first outlet
        if (!selectedOutletId) setSelectedOutletId("all");
      }
    };
    fetchOutlets();
  }, [user]);

  if (outlets.length === 0) return null;

  return (
    <div className="px-2">
      <Select
        value={selectedOutletId || ""}
        onValueChange={setSelectedOutletId}
      >
        <SelectTrigger className="w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground">
          <Store className="h-4 w-4 mr-2 shrink-0" />
          <SelectValue placeholder="Select outlet" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Outlets</SelectItem>
          {outlets.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default OutletSelector;
