---
name: weekly-groceries
description: Plan a week of meals from the user's DIET_PREFERENCES.md, price every ingredient at their Kroger-family store (Ralphs, Kroger, Fred Meyer...), and add the approved list to their real cart for delivery. Use when the user asks for a weekly grocery list, a meal plan, meal prep, "what should I eat this week", or to shop for recipes.
---

# Weekly groceries

Plan the user's week of meals, find every ingredient in stock at their store, and add the approved list to their cart. Read `AGENTS.md` for the `kroger.mjs` commands and API limits. This skill covers the planning.

## 1. Load preferences

Read `DIET_PREFERENCES.md` in the repo root. It sets everything personal: calorie and protein targets, activity, priorities, cooking skill, food rules, which meals to plan and pantry items not to buy.

- **The file is missing:** copy `DIET_PREFERENCES.example.md` to `DIET_PREFERENCES.md`, then ask the user the questions in it, a few at a time, and write their answers in. Stop and set this up before planning anything.
- **Lines that matter this week are blank** (which meals, how many days, servings): ask once, then offer to save the answer to the file so it isn't asked again.
- Follow the file over the defaults below. If the user asks for something different this week, follow the request without editing the file, unless they ask you to.

Also check `.env` has the three `KROGER_*` variables (print names only) and `.kroger-token.json` exists. If either is missing, point the user to the setup section in `AGENTS.md`.

## 2. Ask about this week

Ask briefly, in one message:
- Anything specific to this week: cravings, eating out, travel, fewer days?
- Anything already in the fridge to use up?
- Did you add anything to your cart yourself? The API can't read the cart, so this avoids duplicates.

Skip anything the user already answered in their request.

## 3. Plan the meals

Hit the daily targets in `DIET_PREFERENCES.md` within about ±10% for calories and at least 95% of protein. Show approximate numbers per meal and per day, and say they're estimates.

**Keep it simple** (scale to the skill level in the file; for a beginner, apply all of these):
- About 4–6 main ingredients per meal, not counting oil, salt, pepper and spices.
- One pan, sheet pan, air fryer or no-cook where possible. No techniques a beginner hasn't done before.
- Repeat meals across the week. Two or three dinners cooked in batches beat seven different recipes: less waste, less cooking, a shorter list.
- Reuse ingredients across meals (one pack of chicken thighs for two meals; the same vegetables in several).
- Breakfasts and snacks can be assembly-only (Greek yogurt bowls, eggs, protein shakes, cottage cheese, fruit).

**Healthy and clean**, unless the file says otherwise:
- Whole foods: lean proteins, eggs, dairy, vegetables, fruit, potatoes, rice, oats, beans, nuts, olive oil.
- Avoid heavily processed foods, added sugar, and long ingredient lists of additives.
- A protein source at every meal, spread across the day rather than one huge serving.
- Vegetables or fruit at most meals, for fiber.

**Training days**, if the file mentions workouts: fine to put more carbs around workouts (rice, potatoes, oats, fruit) and keep protein steady every day.

## 4. Build the shopping list

1. Combine every ingredient across all meals into one list with total quantities, then round up to real pack sizes.
2. Remove anything under "Always on hand" in the file, and anything the user said they have.
3. Search each item with `node --env-file=.env kroger.mjs search "<term>" 10`.
4. Choose products in the order the file's priorities set. With "quality first, then price":
   - **Stock and availability:** `HIGH` > `LOW` > `UNKNOWN` (normal for produce). Skip `TEMPORARILY_OUT_OF_STOCK` and `NOT_CARRIED`. Require `delivery: true`.
   - **Quality:** where it matters, prefer pasture-raised eggs, air-chilled or organic chicken, grass-fed beef, wild-caught fish, plain unsweetened dairy (plain Greek yogurt, not flavored), and short ingredient lists. Produce and staples (rice, oats, frozen vegetables) rarely need a premium.
   - **Price:** among comparable quality, take the best unit price. Store premium lines (Simple Truth, Simple Truth Organic, Private Selection) often match name brands for less. Note any `promo` prices.
   - Check the description matches the ingredient. Search results include loose matches.
   - Respect preferred and avoided brands in the file.
5. If nothing good is in stock, choose a substitute and say so.

## 5. Present for approval

Show, in this order:

1. **Meal plan:** a table of days by meals, with approximate calories and protein per day.
2. **Recipes:** for each distinct meal, the ingredients and 3–6 short numbered steps, including temperatures and times. Write for someone who rarely cooks.
3. **Prep tips** (optional): what to batch-cook on Sunday, how long things keep.
4. **Shopping list:** a table of item, product, size, qty, price, stock and aisle, and an estimated total. Then list anything substituted, out of stock or not found.

Then ask the user to approve or swap. **Do not add anything to the cart until they approve.**

## 6. Add to cart

- Add everything in **one** call: `node --env-file=.env kroger.mjs add <upc:qty> <upc:qty> ...`
- If the call fails, show the error and don't retry blindly: part of it may have succeeded, and the API can't remove items. Ask the user to check their cart first.
- If the login token has expired and can't refresh, tell the user to run `node --env-file=.env kroger.mjs login`.

Then tell the user what was added, and remind them to open ralphs.com or the app, pick a delivery time and check out.

## 7. Save the week

Write `lists/YYYY-MM-DD.md`, using the date the list was added, containing the meal plan, recipes and final shopping list (with prices and total). Before planning a new week, read the last two or three files in `lists/` so meals don't repeat too often, and reuse the ones the user liked.
