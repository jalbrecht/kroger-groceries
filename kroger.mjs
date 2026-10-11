#!/usr/bin/env node
// Kroger/Ralphs helper. Run with: node --env-file=.env kroger.mjs <command>
//
//   login                      one-time browser login (saves .kroger-token.json)
//   search <term> [limit]      products at KROGER_LOCATION_ID with price/stock/aisle (JSON)
//   add <upc:qty> [...]        add items to your cart (delivery)
//   profile                    confirm which account the token belongs to

import http from 'node:http';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const API = 'https://api.kroger.com/v1';
const REDIRECT_URI = 'http://localhost:3000/callback';
const TOKEN_FILE = new URL('./.kroger-token.json', import.meta.url);
const { KROGER_CLIENT_ID: CLIENT_ID, KROGER_CLIENT_SECRET: CLIENT_SECRET, KROGER_LOCATION_ID: LOCATION_ID } = process.env;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing KROGER_CLIENT_ID / KROGER_CLIENT_SECRET (run with --env-file=.env)');
  process.exit(1);
}

const basicAuth = 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

async function tokenRequest(params) {
  const res = await fetch(`${API}/connect/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

function saveUserToken(data) {
  const token = { ...data, expires_at: Date.now() + (data.expires_in - 60) * 1000 };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2), { mode: 0o600 });
  return token;
}

async function userToken() {
  if (!fs.existsSync(TOKEN_FILE)) throw new Error('Not logged in. Run: node --env-file=.env kroger.mjs login');
  let token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  if (Date.now() >= token.expires_at) {
    const refreshed = await tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh_token });
    token = saveUserToken({ refresh_token: token.refresh_token, ...refreshed });
  }
  return token.access_token;
}

async function appToken() {
  return (await tokenRequest({ grant_type: 'client_credentials', scope: 'product.compact' })).access_token;
}

function login() {
  // Random state ties the callback to this login attempt (OAuth CSRF protection)
  const state = randomBytes(16).toString('hex');
  const url = `${API}/connect/oauth2/authorize?` + new URLSearchParams({
    scope: 'cart.basic:write profile.compact',
    response_type: 'code',
    state,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
  });
  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, REDIRECT_URI);
    if (reqUrl.pathname !== '/callback') return res.writeHead(404).end();
    // Ignore callbacks that didn't come from this login attempt, and keep waiting for the real one
    if (reqUrl.searchParams.get('state') !== state) return res.writeHead(400).end('Invalid state');
    const code = reqUrl.searchParams.get('code');
    try {
      if (!code) throw new Error(reqUrl.searchParams.get('error_description') || reqUrl.searchParams.get('error') || 'No code returned');
      saveUserToken(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }));
      res.end('Logged in to Kroger. You can close this tab.');
      console.log('Login successful. Token saved to .kroger-token.json');
    } catch (err) {
      res.end(`Login failed: ${err.message}`);
      console.error(`Login failed: ${err.message}`);
      process.exitCode = 1;
    }
    server.close();
  });
  server.listen(3000, '127.0.0.1', () => {
    console.log(`Opening browser for Kroger login...\n${url}`);
    execFile('open', [url]);
  });
}

async function search(term, limit = 5) {
  const params = new URLSearchParams({ 'filter.term': term, 'filter.limit': String(limit) });
  if (LOCATION_ID) params.set('filter.locationId', LOCATION_ID);
  const res = await fetch(`${API}/products?${params}`, { headers: { Authorization: `Bearer ${await appToken()}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Search failed (${res.status}): ${JSON.stringify(data)}`);
  const products = data.data.map((p) => {
    const item = p.items?.[0] ?? {};
    return {
      upc: p.upc,
      description: p.description,
      brand: p.brand,
      size: item.size,
      price: item.price?.regular ?? null,
      promo: item.price?.promo || null,
      // Produce often has no inventory data even when sold; only call it not carried if no fulfillment either
      stock: item.inventory?.stockLevel ?? (Object.values(item.fulfillment ?? {}).some(Boolean) ? 'UNKNOWN' : 'NOT_CARRIED'),
      delivery: item.fulfillment?.delivery ?? false,
      aisle: p.aisleLocations?.map((a) => a.description).join(', ') || null,
    };
  });
  console.log(JSON.stringify(products, null, 2));
}

async function add(specs) {
  const items = specs.map((spec) => {
    const [upc, qty = '1'] = spec.split(':');
    return { upc, quantity: Number(qty), modality: 'DELIVERY' };
  });
  const res = await fetch(`${API}/cart/add`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${await userToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`Cart add failed (${res.status}): ${await res.text()}`);
  console.log(`Added ${items.length} item(s) to cart: ${items.map((i) => `${i.upc} x${i.quantity}`).join(', ')}`);
}

async function profile() {
  const res = await fetch(`${API}/identity/profile`, { headers: { Authorization: `Bearer ${await userToken()}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Profile failed (${res.status}): ${JSON.stringify(data)}`);
  console.log(JSON.stringify(data.data));
}

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  login: () => login(),
  search: () => search(args[0], args[1]),
  add: () => add(args),
  profile: () => profile(),
};
if (!commands[cmd]) {
  console.error('Usage: kroger.mjs login | search <term> [limit] | add <upc:qty> [...] | profile');
  process.exit(1);
}
Promise.resolve(commands[cmd]()).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
