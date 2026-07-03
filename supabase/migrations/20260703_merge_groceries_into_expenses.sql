do $$
begin
  if not exists (
    select 1
    from public.categories
    where type = 'expense'
      and lower(trim(name)) = 'grocery'
  ) then
    raise exception 'Cannot merge groceries: Grocery expense category not found';
  end if;
end
$$;

insert into public.expenses (
  outlet_id,
  category_id,
  amount,
  date,
  notes,
  created_by
)
select
  grocery.outlet_id,
  grocery_category.id,
  grocery.cost,
  grocery.date,
  grocery.item_name
    || ' x'
    || to_char(grocery.quantity, 'FM999999990.##')
    || coalesce(grocery.unit, '')
    || case
      when nullif(trim(grocery.notes), '') is null then ''
      else ' — ' || trim(grocery.notes)
    end,
  grocery.created_by
from public.grocery_purchases as grocery
cross join lateral (
  select category.id
  from public.categories as category
  where category.type = 'expense'
    and lower(trim(category.name)) = 'grocery'
  order by category.id
  limit 1
) as grocery_category;
