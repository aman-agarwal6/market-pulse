// Minimal reader for legacy Excel .xls (OLE2 compound file + BIFF8) workbooks.
// Only what we need for small public data files: the first worksheet's numeric
// cells, shared strings and cached formula results. No dependencies.

function readCFB(buf) {
  if (buf.readUInt32LE(0) !== 0xE011CFD0 || buf.readUInt32LE(4) !== 0xE11AB1A1) throw new Error('not an OLE2 file');
  const secSize = 1 << buf.readUInt16LE(0x1E);
  const miniSize = 1 << buf.readUInt16LE(0x20);
  const nFat = buf.readUInt32LE(0x2C);
  const dirStart = buf.readUInt32LE(0x30);
  const miniCutoff = buf.readUInt32LE(0x38);
  const miniFatStart = buf.readUInt32LE(0x3C);
  let difatSec = buf.readUInt32LE(0x44);
  const sec = n => buf.subarray((n + 1) * secSize, (n + 2) * secSize);
  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < nFat; i++) fatSectors.push(buf.readUInt32LE(0x4C + i * 4));
  let guard = 0;
  while (fatSectors.length < nFat && difatSec < 0xFFFFFFFA && guard++ < 1000) {
    const s = sec(difatSec);
    for (let i = 0; i < secSize / 4 - 1 && fatSectors.length < nFat; i++) fatSectors.push(s.readUInt32LE(i * 4));
    difatSec = s.readUInt32LE(secSize - 4);
  }
  const fat = [];
  for (const fs of fatSectors) { const s = sec(fs); for (let i = 0; i < secSize / 4; i++) fat.push(s.readUInt32LE(i * 4)); }
  const chain = (start, table) => {
    const out = []; let n = start, g = 0;
    while (n < 0xFFFFFFFA && g++ < 1e6) { out.push(n); n = table[n]; }
    return out;
  };
  const readChain = start => Buffer.concat(chain(start, fat).map(sec));
  const dir = readChain(dirStart);
  const entries = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = dir.readUInt16LE(off + 0x40);
    const name = dir.subarray(off, off + Math.max(0, nameLen - 2)).toString('utf16le');
    entries.push({ name, type: dir[off + 0x42], start: dir.readUInt32LE(off + 0x74), size: dir.readUInt32LE(off + 0x78) });
  }
  const root = entries.find(e => e.type === 5);
  const miniFat = [];
  if (miniFatStart < 0xFFFFFFFA) { const m = readChain(miniFatStart); for (let i = 0; i < m.length / 4; i++) miniFat.push(m.readUInt32LE(i * 4)); }
  const miniStream = root ? readChain(root.start) : Buffer.alloc(0);
  return name => {
    const e = entries.find(x => x.type === 2 && x.name === name);
    if (!e) return null;
    if (e.size < miniCutoff) return Buffer.concat(chain(e.start, miniFat).map(n => miniStream.subarray(n * miniSize, (n + 1) * miniSize))).subarray(0, e.size);
    return readChain(e.start).subarray(0, e.size);
  };
}

function decodeRK(rk) {
  let v;
  if (rk & 2) v = rk >> 2;
  else { const b = Buffer.alloc(8); b.writeUInt32LE(0, 0); b.writeUInt32LE((rk & 0xFFFFFFFC) >>> 0, 4); v = b.readDoubleLE(0); }
  return rk & 1 ? v / 100 : v;
}

/** Parse the shared string table (SST record plus CONTINUE records). */
function parseSST(parts) {
  // parts: array of Buffers (SST body, then each CONTINUE body)
  let p = 0, off = 8;
  const strings = [];
  const total = parts[0].readUInt32LE(4);
  const need = n => { if (off + n > parts[p].length) { p++; off = 0; } };
  for (let s = 0; s < total && p < parts.length; s++) {
    need(3);
    if (p >= parts.length) break;
    let cch = parts[p].readUInt16LE(off); let flags = parts[p][off + 2]; off += 3;
    let runs = 0, ext = 0;
    if (flags & 8) { runs = parts[p].readUInt16LE(off); off += 2; }
    if (flags & 4) { ext = parts[p].readUInt32LE(off); off += 4; }
    let str = '';
    while (cch > 0) {
      if (off >= parts[p].length) { p++; off = 0; flags = parts[p][off]; off += 1; }
      const wide = flags & 1;
      const avail = Math.floor((parts[p].length - off) / (wide ? 2 : 1));
      const take = Math.min(avail, cch);
      const slice = parts[p].subarray(off, off + take * (wide ? 2 : 1));
      str += wide ? slice.toString('utf16le') : slice.toString('latin1');
      off += slice.length; cch -= take;
    }
    let skip = runs * 4 + ext;
    while (skip > 0) { const a = Math.min(skip, parts[p].length - off); off += a; skip -= a; if (skip > 0) { p++; off = 0; } }
    strings.push(str);
  }
  return strings;
}

/** Returns the first worksheet as a sparse grid: rows[r][c] = number | string. */
export function readFirstSheet(buf) {
  const get = readCFB(buf);
  const wb = get('Workbook') || get('Book');
  if (!wb) throw new Error('no Workbook stream');
  let sst = [];
  const sstParts = [];
  let inSST = false;
  const rows = [];
  let bofCount = 0;
  const set = (r, c, v) => { (rows[r] ||= [])[c] = v; };
  for (let off = 0; off + 4 <= wb.length;) {
    const type = wb.readUInt16LE(off), len = wb.readUInt16LE(off + 2);
    const d = wb.subarray(off + 4, off + 4 + len);
    off += 4 + len;
    if (type === 0x0809) { bofCount++; if (bofCount > 2) break; continue; }
    if (type === 0x00FC) { sstParts.push(d); inSST = true; continue; }
    if (type === 0x003C && inSST) { sstParts.push(d); continue; }
    if (inSST) { sst = parseSST(sstParts); inSST = false; }
    if (bofCount < 2) continue; // still in workbook globals
    if (type === 0x0203) set(d.readUInt16LE(0), d.readUInt16LE(2), d.readDoubleLE(6));
    else if (type === 0x027E) set(d.readUInt16LE(0), d.readUInt16LE(2), decodeRK(d.readInt32LE(6)));
    else if (type === 0x00BD) {
      const r = d.readUInt16LE(0), c0 = d.readUInt16LE(2);
      const n = (len - 6) / 6;
      for (let i = 0; i < n; i++) set(r, c0 + i, decodeRK(d.readInt32LE(4 + i * 6 + 2)));
    } else if (type === 0x00FD) set(d.readUInt16LE(0), d.readUInt16LE(2), sst[d.readUInt32LE(6)] ?? '');
    else if (type === 0x0006) {
      if (d.readUInt16LE(12) !== 0xFFFF) set(d.readUInt16LE(0), d.readUInt16LE(2), d.readDoubleLE(6));
    }
  }
  return rows;
}

/** Excel serial date (1900 system) -> 'YYYY-MM-DD'. */
export function excelDate(serial) {
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}
