// S&P 500 constituents with GICS sector / sub-industry.
// Pulled from the open "datasets/s-and-p-500-companies" list and cached locally.
import fs from 'node:fs/promises';
import path from 'node:path';

const URL = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function loadUniverse(dataDir) {
  const file = path.join(dataDir, 'sp500.json');
  let cached = null;
  try {
    const stat = await fs.stat(file);
    cached = JSON.parse(await fs.readFile(file, 'utf8'));
    if (Date.now() - stat.mtimeMs < MAX_AGE_MS && cached.length > 400) return cached;
  } catch { /* no cache yet */ }

  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = parseCSV(await res.text());
    const head = rows[0];
    const iS = head.indexOf('Symbol'), iN = head.indexOf('Security'), iSec = head.indexOf('GICS Sector'), iInd = head.indexOf('GICS Sub-Industry');
    const list = rows.slice(1).filter(r => r[iS]).map(r => ({
      s: r[iS].trim(),
      ys: r[iS].trim().replace(/\./g, '-'),
      n: r[iN].trim(),
      sec: r[iSec].trim(),
      ind: r[iInd].trim(),
    }));
    if (list.length < 400) throw new Error('constituent list too short');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(list));
    return list;
  } catch (err) {
    if (cached) { console.warn('[universe] using cached list:', err.message); return cached; }
    throw err;
  }
}
