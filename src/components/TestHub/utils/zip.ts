// Minimal ZIP builder (STORE method, no compression)

export const crc32 = (data: Uint8Array): number => {
  let crc = ~0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return ~crc >>> 0;
};

export const buildZip = (files: { name: string; content: string }[]): Blob => {
  const enc = new TextEncoder();
  const entries = files.map(f => ({ name: enc.encode(f.name), data: enc.encode(f.content) }));
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + e.name.length + e.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true); lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, e.name.length, true);
    local.set(e.name, 30); local.set(e.data, 30 + e.name.length);
    locals.push(local);
    const central = new Uint8Array(46 + e.name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, e.name.length, true); cv.setUint32(42, offset, true);
    central.set(e.name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, eocd] as BlobPart[], { type: 'application/zip' });
};
