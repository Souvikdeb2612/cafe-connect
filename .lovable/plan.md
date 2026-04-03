

## Plan: Simplify All Outlets Mode in Sales

### Summary
When "All Outlets" is selected, hide the New Sale and edit buttons, and show a brief info note prompting the user to select a specific outlet.

### Changes (single file: `src/pages/Sales.tsx`)

1. **Hide "New Sale" button** when `selectedOutletId === "all"` (or not set) — already partially done with `disabled`, now fully hide it.

2. **Show info banner** in "All Outlets" mode — a small muted text note below the header: *"Select a specific outlet to add or edit sales."*

3. **Hide edit (Pencil) buttons** on each row when in "All Outlets" mode — conditionally render the edit icon only when `canCreateSale` is true.

4. **Keep the table read-only** in "All Outlets" mode — sales are still listed (individual rows, not grouped), but no interaction beyond viewing.

### No other changes
- No query changes, no grouping logic changes, no dialog changes.

