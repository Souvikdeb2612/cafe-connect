import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOutlet } from "@/contexts/OutletContext";
import { useOutlets } from "@/hooks/useOutlets";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Store } from "lucide-react";

const OutletSelector = () => {
  const { user } = useAuth();
  const { selectedOutletId, setSelectedOutletId } = useOutlet();
  const { data: outlets = [] } = useOutlets();

  useEffect(() => {
    if (!user) return;
    if (outlets.length > 0 && !selectedOutletId) {
      setSelectedOutletId("all");
    }
  }, [user, outlets, selectedOutletId, setSelectedOutletId]);

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
