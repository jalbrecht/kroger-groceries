#!/usr/bin/env node
// Local viewer for the saved weekly lists in lists/. Run with: npm run lists
//
// Serves http://localhost:3001 (3000 is taken by the login callback). Only
// listens on 127.0.0.1. Renders each lists/YYYY-MM-DD.md as a page; click a
// recipe step or shopping row to cross it off while cooking.

import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.PORT) || 3001;
const LISTS_DIR = new URL('./lists/', import.meta.url);

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

// Just enough Markdown for the list files: headings, tables, lists, paragraphs.
function render(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) {
      const n = m[1].length;
      out.push(`<h${n}>${inline(m[2])}</h${n}>`);
      i++;
    } else if (line.trim().startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      out.push('<div class="table"><table><thead><tr>' + cells(head).map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + body.map((r) => '<tr class="tick">' + cells(r).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table></div>');
    } else if (/^\s*(\d+\.|[-*])\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*(\d+\.|[-*])\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*(\d+\.|[-*])\s+/, ''));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>` + items.map((t) => `<li class="tick">${inline(t)}</li>`).join('') + `</${tag}>`);
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#|\||\s*(\d+\.|[-*])\s)/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
  }
  return out.join('\n');
}

function listFiles() {
  try {
    return fs.readdirSync(LISTS_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse();
  } catch {
    return [];
  }
}

function page(title, nav, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --bg: #fafaf7; --fg: #1f2421; --muted: #6b716c; --line: #e3e3dc; --accent: #2f7d4f; --card: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161917; --fg: #e8ebe8; --muted: #9aa29c; --line: #2c312e; --accent: #6cc28f; --card: #1d211f; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.55 system-ui, -apple-system, sans-serif; }
  .wrap { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }
  nav { border-right: 1px solid var(--line); padding: 20px 16px; position: sticky; top: 0; height: 100vh; overflow: auto; }
  nav h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 10px; }
  nav a { display: block; padding: 6px 10px; border-radius: 6px; color: var(--fg); text-decoration: none; }
  nav a.on { background: var(--accent); color: var(--bg); }
  main { padding: 24px 32px 80px; max-width: 900px; }
  h1 { margin-top: 0; } h2 { margin-top: 2em; border-bottom: 1px solid var(--line); padding-bottom: 4px; } h3 { margin-top: 1.6em; }
  .table { overflow-x: auto; } table { border-collapse: collapse; width: 100%; background: var(--card); font-size: 15px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; }
  ol li, ul li { margin: 6px 0; } ol li { padding-left: 4px; }
  .tick { cursor: pointer; } .tick.done { text-decoration: line-through; opacity: .45; }
  code { font-size: 13px; color: var(--muted); }
  .hint { color: var(--muted); font-size: 14px; }
  @media (max-width: 700px) {
    .wrap { grid-template-columns: 1fr; }
    nav { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); display: flex; gap: 6px; overflow-x: auto; padding: 12px 16px; }
    nav h2 { display: none; } nav a { white-space: nowrap; }
    main { padding: 16px 16px 60px; }
  }
</style>
</head>
<body>
<div class="wrap">
<nav><h2>Weeks</h2>${nav}</nav>
<main>${body}</main>
</div>
<script>
  // Cross off steps and rows; remembered per week in this browser.
  const key = 'ticks:' + location.pathname;
  let done = new Set();
  try { done = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch {}
  const items = [...document.querySelectorAll('.tick')];
  items.forEach((el, i) => {
    if (done.has(i)) el.classList.add('done');
    el.addEventListener('click', () => {
      el.classList.toggle('done');
      el.classList.contains('done') ? done.add(i) : done.delete(i);
      try { localStorage.setItem(key, JSON.stringify([...done])); } catch {}
    });
  });
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const files = listFiles();
  const url = new URL(req.url, 'http://localhost');
  let name = decodeURIComponent(url.pathname.slice(1));
  if (!name && files.length) name = files[0].replace(/\.md$/, '');

  const nav = files.map((f) => {
    const n = f.replace(/\.md$/, '');
    return `<a href="/${n}"${n === name ? ' class="on"' : ''}>${n}</a>`;
  }).join('') || '<span class="hint">No lists yet</span>';

  if (!files.length) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page('Weekly lists', nav, '<h1>No lists yet</h1><p class="hint">Saved weeks show up here once lists/YYYY-MM-DD.md exists.</p>'));
  }
  if (!files.includes(`${name}.md`)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page('Not found', nav, '<h1>Not found</h1>'));
  }

  const md = fs.readFileSync(new URL(`${name}.md`, LISTS_DIR), 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page(name, nav, render(md) + '<p class="hint">Tap a step or row to cross it off.</p>'));
});

server.listen(PORT, '127.0.0.1', () => console.log(`Weekly lists: http://localhost:${PORT}`));
