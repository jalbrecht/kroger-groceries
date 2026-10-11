# kroger-groceries

Have an AI agent plan your week of meals, find every ingredient in stock at your local Kroger-family store, and put it all in your real cart. You pick a delivery time and click checkout.

Works with any store on the Kroger API: Kroger, Ralphs, Fred Meyer, King Soopers, Harris Teeter, QFC, Smith's, Fry's, Dillons and others.

```
You:    build my weekly groceries
Agent:  plans meals to your calorie/protein targets → checks price, stock and aisle at your store
        → shows you the plan, simple recipes and the priced list → adds it to your cart once you approve
You:    open ralphs.com → pick a delivery slot → checkout
```

Built for [Claude Code](https://claude.com/claude-code), which picks up the `weekly-groceries` skill automatically. Agents that read `AGENTS.md` work too.

## What you need

- Node.js 20 or newer (no npm packages needed)
- A Kroger-family shopper account (the one you use on ralphs.com, kroger.com, etc.)
- A free Kroger developer app (below)

## Setup

### 1. Create a Kroger developer app

1. Go to https://developer.kroger.com and sign in. Your normal shopper login works.
2. Create an app:
   - **Environment:** Production. Certification is Kroger's test server and won't work.
   - **API Products:** Products, Locations, Cart and Profile
   - **Redirect URI:** `http://localhost:3000/callback`, exactly
3. Copy the Client ID and Client Secret.

### 2. Configure

```bash
git clone https://github.com/jalbrecht/kroger-groceries.git
cd kroger-groceries
cp .env.example .env
cp DIET_PREFERENCES.example.md DIET_PREFERENCES.md
```

Put your Client ID and Secret in `.env`. To find your store's location ID, ask your agent "find my store ID for zip 90210", or run:

```bash
npx -p open-supermarkets supermarket kroger-stores --zip 90210
```

Then set `KROGER_LOCATION_ID` in `.env`. Without it you get no prices or stock.

Fill in `DIET_PREFERENCES.md` with your calorie and protein targets, cooking skill, food rules, which meals to plan, and pantry items you already have. Skip it if you prefer; the skill asks the questions the first time.

### 3. Log in to your cart (once)

```bash
node --env-file=.env kroger.mjs login
```

A Kroger login page opens in your browser. Approve it, and a token is saved to `.kroger-token.json`. It refreshes itself after that.

### 4. Use it

Open the folder in Claude Code and say:

> build my weekly groceries

or, for one-off shopping:

> what's the cheapest good olive oil in stock?
> add everything for chicken fajitas to my cart

## Commands

The agent runs these for you, but they work by hand too:

```bash
node --env-file=.env kroger.mjs search "greek yogurt" 10   # price, stock, aisle at your store (JSON)
node --env-file=.env kroger.mjs add 0001111041700:2         # add UPC x quantity to your cart
node --env-file=.env kroger.mjs profile                     # check you're logged in
node --env-file=.env kroger.mjs login                       # log in again if needed
```

## Limits

These come from Kroger's public API:

- **The cart is add-only.** The API can't read, remove from or empty your cart, so the agent always shows you the list before adding. Fix mistakes on the website or app.
- **No checkout and no delivery slots.** You choose a time and place the order yourself. Nothing is ever bought for you.
- **Stock is approximate:** only high, low or out of stock, and fresh produce often has no stock data at all.

## Privacy

These files hold your keys, login, health targets and spending. They're gitignored and stay on your machine:

- `.env`: API keys and store ID
- `.kroger-token.json`: your cart login. Treat it like a password
- `DIET_PREFERENCES.md`: your targets and food rules
- `lists/`: each week's saved plan and shopping list

## Files

| File | Purpose |
|---|---|
| `kroger.mjs` | Login, search, add to cart. Talks to the Kroger API directly |
| `.claude/skills/weekly-groceries/SKILL.md` | The meal planning and shopping workflow |
| `AGENTS.md` | Instructions for agents: API details, product selection, limits |
| `DIET_PREFERENCES.example.md` | Template for your preferences |
| `.env.example` | Template for your keys |

Not affiliated with Kroger or any of its stores.

[![Built on Xano](https://img.shields.io/badge/built_on-Xano-0055FF)](https://xano.com)
