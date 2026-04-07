# Cafe Connect Telegram Bot

Records cafe sales and expenses from a Telegram group directly into the Cafe Connect Supabase database — no manual entry needed.

---

## How It Works

Staff send messages in the group following this format:

```
SALE DLF Mall
Cold Coffee x2 @120
Sandwich @90
---
450

EXPENSE Koramangala
Auto Rickshaw @45
Groceries @300
---
345
```

The bot:
1. Parses the message and validates that parsed total = stated total
2. Resolves the outlet name against Cafe Connect's `outlets` table
3. For **SALES**: validates each item against the `menu_items` table
4. Writes to `sales` + `sale_items` (or `expenses`) in Supabase
5. Replies with ✅ or ⚠️ in the group

---

## Prerequisites

- Node.js ≥ 18
- Access to the Cafe Connect Supabase project (URL + anon key)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

---

## Setup

### Step 1 — Create the Telegram Bot

1. Open Telegram and start a chat with **[@BotFather](https://t.me/BotFather)**
2. Send `/newbot`
3. Follow the prompts: give it a name and a username (e.g. `CafeConnectBot`)
4. Copy the bot token — it looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxYZ`

### Step 2 — Create a Telegram Group

1. Create a new Telegram group (Settings → New Group)
2. Add all staff members and the bot (search for your bot's username from Step 1)
3. Copy the **Group ID**:
   - Add [@userinfobot](https://t.me/userinfobot) to the group temporarily
   - It will reply with your `id` — that is your **Group ID** (a large negative number like `-1001234567890`)
   - Remove `@userinfobot` after getting the ID

### Step 3 — Clone the Repo and Install

```bash
git clone https://github.com/Souvikdeb2612/cafe-connect.git
cd cafe-connect

# Create the bot directory at the repo root
mkdir -p cafe-connect-telegram-bot
# (The files are already in that directory if following this guide)
```

### Step 4 — Configure Environment Variables

Create a `.env` file in the `cafe-connect-telegram-bot/` directory:

```bash
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here

# Optional — comma-separated Telegram group IDs that can use the bot
# If omitted, the bot responds in any group it is added to
ALLOWED_GROUP_IDS=-1001234567890,-1000987654321

# Optional — fallback category for expenses when none is specified
DEFAULT_EXPENSE_CATEGORY=General
```

> **Where to find Supabase credentials?**
> Look in `cafe-connect/src/integrations/supabase/client.ts`:
> - `SUPABASE_URL` = the URL constant
> - `SUPABASE_ANON_KEY` = the publishable key constant
>
> Or find them in your Supabase project dashboard under Project Settings → API.

### Step 5 — Install Dependencies and Start

```bash
cd cafe-connect-telegram-bot
npm install

# Start the bot
npm start

# Or for development (restarts on file changes)
npm run dev
```

You should see:
```
🤖 CafeConnectBot started — polling for messages...
```

### Step 6 — Test It

In the Telegram group, send:

```
SALE Test Outlet
Coffee @50
Tea @30
---
80
```

The bot should reply with ✅ (or ⚠️ if something is wrong).

---

## Message Format Reference

### SALE

```
SALE [OutletName]
[ItemName] x[quantity] @[price]   ← x[qty] is optional, defaults to 1
[ItemName] @[price]
---
[total]
```

### EXPENSE

```
EXPENSE [OutletName]
[ItemName] @[price]    ← no quantity field for expenses
[ItemName] @[price]
---
[total]
```

### Rules

| Rule | Detail |
|------|--------|
| Case | `SALE` / `EXPENSE` are case-insensitive |
| Outlet name | Last word of the first line |
| Separator | `---` on its own line separates items from the total |
| Prices | Must include `@` before the amount. Decimals supported (`@120.50`) |
| Quantities | For sales only: `x2`, `x3`, etc. Defaults to 1 if omitted |
| Total validation | Parsed total (sum of qty × price) must equal stated total |
| Unknown items | Sales with items not in `menu_items` → ⚠️ asking to add them first |
| Empty lines | Skipped automatically |

---

## Bot Replies

**Success (sale):**
```
✅ Sale recorded — DLF Mall — ₹450.00
  Cold Coffee x2, Sandwich
```

**Success (expense):**
```
✅ Expense recorded — Koramangala — ₹345.00
  Auto Rickshaw, Groceries
```

**Error (total mismatch):**
```
⚠️ Total mismatch
Stated total (₹450) ≠ calculated total (₹420.00). Please check item quantities and prices.
```

**Error (unknown outlet):**
```
⚠️ Unknown outlet: "DlF Mll"
Known outlets: dlf mall, koramangala, indiranagar. Check spelling or add the outlet in Cafe Connect first.
```

**Error (unknown item):**
```
⚠️ Unknown item(s): "Cold Brew"
Add these items to the Menu Items list in Cafe Connect before logging a sale that includes them.
```

---

## Deployment Options

### Option A — Run on a VPS / Mac Mini (Recommended for simplicity)

```bash
# Clone and set up on your server
git clone https://github.com/Souvikdeb2612/cafe-connect.git
cd cafe-connect/cafe-connect-telegram-bot
npm install

# Create .env with your credentials
touch .env
# ...edit .env...

# Run with systemd (Linux) or launchd (macOS)
# See "Running as a background service" below
```

### Option B — Supabase Edge Function (Advanced)

Convert `index.js` to a Deno Edge Function using `@supabase/supabase-js` and the Telegram Bot API HTTP polling approach. Note: Edge Functions have a 60-second response limit and don't support long-running polling natively. You'd need to use Telegram's webhook mode instead of polling, which requires an HTTPS URL.

For a small team, running it as a Node process on a always-on machine (Mac Mini, Raspberry Pi, or cheap VPS) is simpler and more reliable.

### Option C — PM2 (Process Manager)

```bash
npm install -g pm2
pm2 start index.js --name cafe-bot
pm2 save
pm2 startup   # generates startup script for your OS
```

### Running as a systemd service (Linux)

```ini
# /etc/systemd/system/cafe-bot.service
[Unit]
Description=Cafe Connect Telegram Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/cafe-connect/cafe-connect-telegram-bot
ExecStart=/usr/bin/node index.js
Restart=on-failure
Environment=NODE_ENV=production

# Or use EnvironmentFile for secrets
EnvironmentFile=/home/your-user/cafe-connect-telegram-bot/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable cafe-bot
sudo systemctl start cafe-bot
sudo systemctl status cafe-bot
```

---

## Database Tables Used

| Table | How it's used |
|-------|---------------|
| `outlets` | Resolves outlet name → `id` for FK references |
| `menu_items` | Validates sale items exist before writing |
| `sales` | Inserted by the bot for each SALE message |
| `sale_items` | One row per line item, linked to `sales.id` |
| `expenses` | One row per line item (expenses don't have a separate items table in the app) |
| `categories` | Resolves expense category; must have `type = 'expense'` |

> The bot assumes these tables already exist with the schema from the main Cafe Connect app. If you've modified the schema, update `index.js` accordingly.

---

## Caching

Outlet, menu item, and category data are cached in memory for 5 minutes to avoid excessive Supabase queries. If you add a new outlet or menu item in Cafe Connect, the bot will pick it up within 5 minutes without a restart.

To force a refresh, restart the bot process.

---

## Troubleshooting

**Bot not responding in the group?**
- Make sure you've added the bot to the group
- Check that the bot has at least "Read Messages" permission in the group
- If you set `ALLOWED_GROUP_IDS`, verify the group ID is correct

**"Unknown outlet" even though the outlet exists in Cafe Connect?**
- The outlet name is matched case-insensitively
- Check the exact spelling in the `outlets` table
- The bot caches outlets for 5 minutes — restart if you just added the outlet

**"Unknown item(s)" on a sale?**
- The item must exist in `menu_items` with `is_active = true`
- Add the item in Cafe Connect first, then retry the sale

**Total mismatch errors?**
- Double-check that the stated total at the bottom exactly equals the sum of qty × price
- The bot rounds to 2 decimal places for comparison
- Don't include the ₹ symbol in the total line — just the number

**Supabase write failures?**
- Check that RLS policies on `sales`, `sale_items`, and `expenses` allow inserts from the anon key
- The anon key is used by the bot (same as the app), so if the app can write, the bot should too
