import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Category {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  amount: number;
  date: string;
  notes: string;
  category_id: string;
  categories?: { name: string };
}

interface CreateExpensePayload {
  outlet_id: string;
  category_id: string | null;
  amount: number;
  date: string;
  notes: string;
  created_by: string | undefined;
}

interface UpdateExpensePayload {
  id: string;
  outlet_id: string;
  category_id: string | null;
  amount: number;
  date: string;
  notes: string;
  created_by: string | undefined;
}

// Fetch expense categories
const fetchCategories = async (): Promise<Category[]> => {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("type", "expense")
    .order("name");

  if (error) throw error;
  return data || [];
};

// Fetch expenses for an outlet
const fetchExpenses = async (selectedOutletId: string | null): Promise<Expense[]> => {
  const { data, error } = await supabase
    .from("expenses")
    .select("*, categories(name)")
    .eq("outlet_id", selectedOutletId!)
    .order("date", { ascending: false });

  if (error) throw error;
  return data || [];
};

// Create expense
const createExpense = async (payload: CreateExpensePayload): Promise<void> => {
  const { error } = await supabase.from("expenses").insert(payload);
  if (error) throw error;
};

// Update expense
const updateExpense = async (payload: UpdateExpensePayload): Promise<void> => {
  const { id, ...updateData } = payload;
  const { error } = await supabase
    .from("expenses")
    .update(updateData)
    .eq("id", id);
  if (error) throw error;
};

// Delete expense
const deleteExpense = async (id: string): Promise<void> => {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
};

// Hook for fetching categories
export const useCategories = () => {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Hook for fetching expenses
export const useExpenses = (selectedOutletId: string | null) => {
  return useQuery({
    queryKey: ["expenses", selectedOutletId],
    queryFn: () => fetchExpenses(selectedOutletId),
    enabled: !!selectedOutletId,
  });
};

// Hook for creating an expense
export const useCreateExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
};

// Hook for updating an expense
export const useUpdateExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
};

// Hook for deleting an expense
export const useDeleteExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
};
