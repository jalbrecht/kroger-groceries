# AGENTS.md

Instructions for AI agents working in this repo.

## Purpose

This repo builds the owner's weekly grocery list and puts it straight into their real Ralphs cart. Ralphs is part of Kroger, so everything here uses the Kroger public API. The owner then opens ralphs.com or the Ralphs app, picks a delivery time and checks out.

A typical request is "here's what I want to cook this week" or "build my weekly list". The agent:

1. Works out the ingredients and quantities.
2. Finds each item at the owner's store, with price, size, stock and aisle.
3. Shows the list and total, and waits for the owner to approve or make swaps.
4. Adds the approved items to the cart.

**Never add to the cart without approval.** The API can't remove items, so every mistake has to be fixed by hand on ralphs.com (see [API limits](#kroger-api-facts-and-limits)).

## Files

| File | Committed | Purpose |
|---|---|---|
| `kroger.mjs` | yes | The only tool: login, search, add to cart, profile. No dependencies, Node 20+ |
| `lists.mjs` | yes | Local web viewer for `lists/` as a recipe guide (`npm run lists`, http://localhost:3001). No dependencies |
| `package.json` | yes | Only holds the `npm run lists` script |
| `AGENTS.md` | yes | This file |
| `.claude/skills/weekly-groceries/SKILL.md` | yes | The weekly meal plan and shopping workflow. Follow it for any weekly-list or meal-plan request |
| `DIET_PREFERENCES.example.md` | yes | Blank template for `DIET_PREFERENCES.md` |
| `DIET_PREFERENCES.md` | **no** | The owner's targets, cooking level and food rules. The skill reads it |
| `lists/` | **no** (only `.gitkeep`) | One saved file per week (`YYYY-MM-DD.md`): meal plan, recipes, shopping list |
| `.env.example` | yes | Template for `.env` |
| `.env` | **no** | Kroger app credentials and the store ID |
| `.kroger-token.json` | **no** | The owner's login token (refresh token included). Treat it like a password |

Never print, log or commit the values in `.env` or `.kroger-token.json`. `DIET_PREFERENCES.md` and `lists/` are personal too, so keep them out of commits. To check `.env`, print only the variable names, for example `sed -E 's/=.*/=<set>/' .env`.

## Setup (one-time, done by the owner)

1. **Create a Kroger developer app** at https://developer.kroger.com. Sign in with a normal Kroger/Ralphs account.
   - Environment: **Production**. `kroger.mjs` calls `api.kroger.com`, and Certification credentials only work against Kroger's test server.
   - API Products: **Products**, **Locations**, **Cart** and **Profile** (all "Public – Production").
   - Redirect URI: `http://localhost:3000/callback`. It must match exactly.
2. **Fill in `.env`** (copy `.env.example`):
   ```
   KROGER_CLIENT_ID=...
   KROGER_CLIENT_SECRET=...
   KROGER_LOCATION_ID=...   # the owner's store
   ```
   Without `KROGER_LOCATION_ID`, search results have no prices, no stock and no fulfillment data.
   To find a store ID, call `GET /v1/locations?filter.zipCode.near=<zip>` with an app token. The open-supermarkets CLI also does this: `npx -p open-supermarkets supermarket kroger-stores --zip <zip>`.
3. **Fill in `DIET_PREFERENCES.md`** (copy `DIET_PREFERENCES.example.md`). If it's missing, the skill copies the template and asks the questions.
4. **Log in once:** `node --env-file=.env kroger.mjs login`. This opens a Kroger login page in the browser and saves `.kroger-token.json`. It refreshes itself after that. Only run it again if a refresh fails.

## Commands

Always run with `--env-file=.env`:

```bash
node --env-file=.env kroger.mjs search "<term>" [limit]   # JSON: upc, description, brand, size, price, promo, stock, delivery, aisle
node --env-file=.env kroger.mjs add <upc:qty> [<upc:qty> ...]  # adds to cart with modality DELIVERY
node --env-file=.env kroger.mjs profile                   # confirms the login token works (returns account id)
node --env-file=.env kroger.mjs login                     # one-time browser login
npm run lists                                             # recipe/list viewer at http://localhost:3001
```

- `search` uses an app token (`client_credentials`, scope `product.compact`). It doesn't need the owner's login.
- `add` and `profile` use the owner's token (scopes `cart.basic:write profile.compact`).
- Pass several items in one `add` call rather than one call per item.

## Building the weekly list

For weekly plans, follow `.claude/skills/weekly-groceries/SKILL.md`, which adds meal planning on top of these steps. For one-off shopping (a single recipe, or a few items):

1. **Ingredients.** Turn the recipes or requests into a combined list. Merge duplicates across recipes (two recipes using onions means one onion line with the combined amount) and convert to store pack sizes.
2. **Search each item.** Raise `limit` (e.g. 8–10) for generic terms so there's room to choose. Pick based on:
   - `stock`: prefer `HIGH`, then `LOW`. Skip `TEMPORARILY_OUT_OF_STOCK` and `NOT_CARRIED`.
   - `delivery: true`, since orders are delivered.
   - Relevance. Searches return loose matches (searching "saffron" also returns Saffron Road frozen meals), so check the description.
   - Price per unit and a sensible pack size. Store brands (Kroger, Simple Truth, Private Selection, Ralphs) are usually cheapest.
3. **Present the list** as a table: item, product, size, price, stock, aisle, plus an estimated total. List separately anything out of stock or not found, with the alternative you suggest.
4. **Wait for approval.** Apply swaps, then add everything in one `add` call.
5. **Report** what was added, and remind the owner to pick a delivery time and check out.

## Kroger API facts and limits

Verified against the live API in October 2026.

- **Base URL:** `https://api.kroger.com/v1`. The token endpoint is `/connect/oauth2/token`, using HTTP Basic auth with the client ID and secret.
- **The cart is add-only.** `PUT /cart/add` with `{"items":[{"upc","quantity","modality"}]}` returns 204. The public API has no way to read, update, remove or empty the cart, and no checkout. Consequences:
  - You can't see what's already in the cart, so ask the owner before adding staples they may have added themselves.
  - Re-running `add` for the same items adds them again. Don't retry an add that may have succeeded; check with the owner.
- **No delivery slots** in the public API. The owner chooses a time at checkout. Fees and minimums are whatever ralphs.com shows.
- **Stock** (`items[].inventory.stockLevel`) is only `HIGH`, `LOW` or `TEMPORARILY_OUT_OF_STOCK`, with no unit counts, and it can lag behind what's on the shelf.
- **Produce often has no inventory data** even when it's sold (bananas, for example). `kroger.mjs` reports this as `stock: "UNKNOWN"` when fulfillment flags are true. Include these items and mark them "stock unknown". `NOT_CARRIED` means no inventory data and no fulfillment at this store.
- **Prices:** `price.regular`, with `price.promo` when the item is on sale (`0` or missing means no promo). Prices are per item, not per pound, even for produce sold by weight.
- **UPCs** are 13-digit strings with leading zeros (e.g. `0000000004235`). Pass them exactly as `search` returns them.
- Kroger's daily rate limits count token requests too, so reuse tokens rather than requesting a new one per call.

## Approaches ruled out

- **open-supermarkets** (https://github.com/abracadabra50/open-supermarkets), tried first:
  - Its MCP server is hardcoded to UK providers (Sainsbury's, Ocado, Tesco, Tesco HU) and can't use Kroger.
  - Its CLI supports Kroger search only, with no cart. Its ✅ marker ignores stock and showed items as available when they were out.
  - The npm release (3.0.0) has no `open-supermarkets` bin, so the README's `npx open-supermarkets ...` fails. Use `npx -p open-supermarkets supermarket ...` if you need it, for example for `kroger-stores`.
- **MCP in general:** not used. `kroger.mjs` through the shell is simpler and covers everything needed.

## Ideas not built yet

Suggestions for growing this into a weekly-list tool, none of which exist yet:

- A `staples.md` or `staples.json` of items bought every week (UPC plus quantity), so the weekly list starts from it.
- Spending summaries built from the saved `lists/` files.
