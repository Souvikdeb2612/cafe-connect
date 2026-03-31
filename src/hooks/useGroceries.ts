import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface GroceryPurchase {
  id: string;
  item_name: string;
  quantity: number;
  unit: string;
  cost: number;
  date: string;
  notes: string;
}

interface CreateGroceryPayload {
  outlet_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  cost: number;
  date: string;
  notes: string;
  created_by: string | undefined;
}

interface UpdateGroceryPayload {
  id: string;
  outlet_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  cost: number;
  date: string;
  notes: string;
  created_by: string | undefined;
}

// Fetch grocery purchases for an outlet
const fetchGroceries = async (
  selectedOutletId: string | null,
): Promise<GroceryPurchase[]> => {
  const { data, error } = await supabase
    .from("grocery_purchases")
    .select("*")
    .eq("outlet_id", selectedOutletId!)
    .order("date", { ascending: false });

  if (error) throw error;
  return data || [];
};

// Create grocery purchase
const createGrocery = async (payload: CreateGroceryPayload): Promise<void> => {
  const { error } = await supabase.from("grocery_purchases").insert(payload);
  if (error) throw error;
};

// Update grocery purchase
const updateGrocery = async (payload: UpdateGroceryPayload): Promise<void> => {
  const { id, ...updateData } = payload;
  const { error } = await supabase
    .from("grocery_purchases")
    .update(updateData)
    .eq("id", id);
  if (error) throw error;
};

// Delete grocery purchase
const deleteGrocery = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from("grocery_purchases")
    .delete()
    .eq("id", id);
  if (error) throw error;
};

// Hook for fetching groceries
export const useGroceries = (selectedOutletId: string | null) => {
  return useQuery({
    queryKey: ["groceries", selectedOutletId],
    queryFn: () => fetchGroceries(selectedOutletId),
    enabled: !!selectedOutletId,
  });
};

// Hook for creating a grocery purchase
export const useCreateGrocery = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createGrocery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groceries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
};

// Hook for updating a grocery purchase
export const useUpdateGrocery = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateGrocery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groceries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
};

// Hook for deleting a grocery purchase
export const useDeleteGrocery = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteGrocery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groceries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
};
