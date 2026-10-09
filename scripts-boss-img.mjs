// Limpia las ilustraciones de bosses generadas con IA (fondo de cuadros «falso», pintado dentro de la imagen),
// recorta y exporta un .webp listo para src/assets/bosses/<id>.webp, más un -preview.png sobre fondo oscuro para revisarlo.
//
//   node scripts-boss-img.mjs <entrada.png> <salida.webp> [alto=420] [tinte=none|cyan|red|any] [velo=x,y,r]
//
// tinte: el brillo del boss tiñe el tablero (cian, rojo o cualquiera) y también hay que quitarlo.
// velo: círculo mágico translúcido pintado sobre el tablero → velo cian semitransparente.
// Variables de entorno: STRICT=1 (solo quita grises del tono exacto del tablero: protege huesos y calaveras),
// GLOW=1 (el halo de partículas sueltas pasa a brillo translúcido; GLOW=2 lo quita y rehace un resplandor suave), CLEAR=x,y,r (tablero entre cuerdas o rejas),
// ERASE=x0,y0,x1,y1;… (borra rectángulos: recortes de referencia pegados), HOLES=x,y;… (fuerza a quitar el hueco gris que contiene ese punto), DBG=1 (lista los huecos candidatos). Recetas usadas: hidra cyan · medusa none + velo 610,398,70 · minotauro red ·
// cerbero red · caronte none STRICT · hades cyan · talos red · polifemo none · sirenas none GLOW=2 CLEAR=481,320,72 ·
// escila none STRICT ERASE=0,0,178,190;178,0,275,112;0,190,125,315;0,315,88,385;718,538,1024,722;0,355,80,395 HOLES=830,272;730,385 ·
// esfinge cyan GLOW=2 · quimera (v2, alada) none STRICT=1 BOX2=175,180,335,400 ERASE=430,0,520,45;750,392,770,412 HOLES=705,268;875,216 · caos none HOLES=550,700 · cronos none · tifon none STRICT.
// BOX2=x0,y0,x1,y1: STRICT=2 solo dentro de ese rectángulo (lo gris de verdad) y STRICT=1 en el resto.
// STRICT=2 además exige el tono que toca en cada casilla de la rejilla (salvó la cabra gris de la Quimera).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const [, , input, output, maxH = '420', tint = 'none', veil = ''] = process.argv;
const src = 'data:image/png;base64,' + readFileSync(input).toString('base64');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage();
const r = await p.evaluate(async ({ src, maxH, tint, DBG, veil, STRICT, GLOW, CLEAR, ERASE, HOLES, BOX2 }) => {
  const img = new Image(); img.src = src; await img.decode();
  const W = img.width, H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, W, H); const d = id.data;
  // Gris del tablero; con `tint`, también el tablero teñido por un brillo de ese color (cian: b ≥ r; rojo: r ≥ b).
  // tono oscuro del tablero, medido en el marco de la imagen (casi todo es tablero): el umbral de gris se adapta a él
  const fh = new Array(256).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (x > 5 && x < W - 6 && y > 5 && y < H - 6) continue; const i = (y * W + x) * 4; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) <= 12) fh[Math.round((d[i] + d[i + 1] + d[i + 2]) / 3)]++; }
  const fp = []; { const h3 = fh.slice(); for (let t = 0; t < 2; t++) { let m = 0; for (let v = 1; v < 256; v++) if (h3[v] > h3[m]) m = v; fp.push(m); for (let v = Math.max(0, m - 20); v <= Math.min(255, m + 20); v++) h3[v] = 0; } }
  const grayMin = Math.min(95, Math.min(...fp) - 18);
  // rejilla del tablero (tamaño de casilla, fase y los dos tonos), medida en la esquina superior izquierda
  const lumAt = (x, y) => { const i = (y * W + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
  const row = 3, edges = [];
  for (let x = 1; x < Math.min(W, 400); x++) if (Math.abs(lumAt(x, row) - lumAt(x - 1, row)) > 25 && (!edges.length || x - edges[edges.length - 1] > 3)) edges.push(x);
  const gaps = edges.slice(1).map((e, i) => e - edges[i]).sort((a, b) => a - b);
  const T = gaps.length ? gaps[gaps.length >> 1] : 16;
  const ph = edges.length ? edges[0] % T : 0;
  const yEdges = [];
  for (let y = 1; y < Math.min(H, 400); y++) if (Math.abs(lumAt(2, y) - lumAt(2, y - 1)) > 25 && (!yEdges.length || y - yEdges[yEdges.length - 1] > 3)) yEdges.push(y);
  const phy = yEdges.length ? yEdges[0] % T : 0;
  const parity = (x, y) => (Math.floor((x - ph + T) / T) + Math.floor((y - phy + T) / T)) & 1;
  const p0 = parity(Math.floor(T / 2) + ph, Math.floor(T / 2) + phy);
  const toneA = lumAt(Math.min(W - 1, ph + Math.floor(T / 2)), Math.min(H - 1, phy + Math.floor(T / 2)));
  const toneB = lumAt(Math.min(W - 1, ph + T + Math.floor(T / 2)), Math.min(H - 1, phy + Math.floor(T / 2)));
  const expected = (x, y) => (parity(x, y) === p0 ? toneA : toneB);
  // dentro de una casilla del tablero el color es plano: 3×3 casi sin variación
  const flat = (x, y) => { let lo = 255, hi = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = Math.min(W - 1, Math.max(0, x + dx)), yy = Math.min(H - 1, Math.max(0, y + dy)); const l = lumAt(xx, yy); lo = Math.min(lo, l); hi = Math.max(hi, l); } return hi - lo <= 10; };
  // BOX2: STRICT=2 solo dentro de ese rectángulo (lo que es gris de verdad) y STRICT=1 en el resto (limpia mejor los bordes)
  const modeAt = (x, y) => (BOX2 && x >= BOX2[0] && x <= BOX2[2] && y >= BOX2[1] && y <= BOX2[3] ? '2' : STRICT);
  const bgLike = (i) => { const r = d[i], g = d[i + 1], bl = d[i + 2]; const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); const lum = (r + g + bl) / 3;
    const SM = BOX2 ? modeAt((i / 4) % W, ((i / 4) / W) | 0) : STRICT;
    if (SM === '2') { // además, el tono tiene que ser el que toca en esa casilla del tablero
      const x = (i / 4) % W, y = ((i / 4) / W) | 0; const bx = ((x - ph) % T + T) % T, by = ((y - phy) % T + T) % T;
      const edge = bx <= 1 || bx >= T - 2 || by <= 1 || by >= T - 2;
      if (mx - mn <= 24 && (edge ? fp.some((t) => Math.abs(lum - t) <= 22) : Math.abs(lum - expected(x, y)) <= 12 && flat(x, y))) return true; }
    else if (SM) { if (mx - mn <= 24 && fp.some((t) => Math.abs(lum - t) <= 22)) return true; }
    else if (mx - mn <= 24 && lum >= grayMin) return true;
    if (tint === 'cyan') return mx - mn <= 75 && bl >= r && lum >= 120;
    if (tint === 'red') return mx - mn <= 75 && r >= bl && r >= g && lum >= 120;
    if (tint === 'any') return mx - mn <= 75 && lum >= 120;
    return false; };
  const bg = new Uint8Array(W * H);
  // ERASE: rectángulos que no son parte del boss (p. ej. recortes de referencia que la IA pega en una esquina)
  if (ERASE) for (const [ex0, ey0, ex1, ey1] of ERASE) for (let y = Math.max(0, ey0); y < Math.min(H, ey1); y++) for (let x = Math.max(0, ex0); x < Math.min(W, ex1); x++) bg[y * W + x] = 1;
  // 1) relleno desde los bordes
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  if (ERASE) for (let k = 0; k < W * H; k++) if (bg[k]) { const x = k % W; if (x > 0) stack.push(k - 1); if (x < W - 1) stack.push(k + 1); if (k >= W) stack.push(k - W); if (k + W < W * H) stack.push(k + W); }
  while (stack.length) {
    const k = stack.pop();
    if (bg[k] || !bgLike(k * 4)) continue;
    bg[k] = 1;
    const x = k % W, y = (k / W) | 0;
    if (x > 0) stack.push(k - 1); if (x < W - 1) stack.push(k + 1); if (y > 0) stack.push(k - W); if (y < H - 1) stack.push(k + W);
  }
  // 2) huecos cerrados: solo si siguen el patrón del tablero (tono claro / oscuro alternando por casillas)
  // los dos tonos del tablero, sacados del fondo ya rellenado
  const hist = new Array(256).fill(0);
  for (let k = 0; k < W * H; k++) if (bg[k]) { const i = k * 4; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) <= 12) hist[Math.round((d[i] + d[i + 1] + d[i + 2]) / 3)]++; }
  const pk = []; const h2 = hist.slice();
  for (let t = 0; t < 2; t++) { let m = 0; for (let v = 1; v < 256; v++) if (h2[v] > h2[m]) m = v; if (!h2[m]) break; pk.push(m); for (let v = Math.max(0, m - 20); v <= Math.min(255, m + 20); v++) h2[v] = 0; }
  // candidato a hueco: gris del tablero (cerca de uno de sus dos tonos) o lo que ya contaba como fondo
  const holeLike = (k) => { const i = k * 4; if (bgLike(i)) return true; const ch = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3; return ch <= 24 && pk.some((t) => Math.abs(l - t) < 16); };
  const seen = new Uint8Array(W * H); let holes = 0; const dbg = []; globalThis.DBG = DBG;
  for (let s = 0; s < W * H; s++) {
    if (bg[s] || seen[s] || !holeLike(s)) continue;
    const comp = []; const st = [s]; seen[s] = 1; let match = 0;
    while (st.length) { const k = st.pop(); comp.push(k);
      const x = k % W, y = (k / W) | 0;
      if (Math.abs(lumAt(x, y) - expected(x, y)) < 22) match++;
      for (const n of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1]) if (n >= 0 && !seen[n] && !bg[n] && holeLike(n)) { seen[n] = 1; st.push(n); } }
    let nA = 0, nB = 0; for (const k of comp) { const l = lumAt(k % W, (k / W) | 0); if (Math.abs(l - pk[0]) < 16) nA++; else if (Math.abs(l - pk[1]) < 16) nB++; }
    const twoTone = pk.length === 2 && nA > comp.length * 0.2 && nB > comp.length * 0.2 && nA + nB > comp.length * 0.7;
    const CM = modeAt(s % W, (s / W) | 0);
    let flatTone = 0; if (CM === '2') for (const k of comp) { const x = k % W, y = (k / W) | 0; const l = lumAt(x, y); if (pk.some((t) => Math.abs(l - t) < 16) && flat(x, y)) flatTone++; }
    let seeded = false; if (HOLES) { let bx0 = W, by0 = H, bx1 = 0, by1 = 0; for (const k of comp) { const x = k % W, y = (k / W) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
      seeded = HOLES.some(([hx, hy]) => hx >= bx0 && hx <= bx1 && hy >= by0 && hy <= by1); }
    if (seeded || comp.length > 120 && (match > comp.length * 0.6 || (CM === '2' ? flatTone > comp.length * 0.4 && nA > comp.length * 0.15 && nB > comp.length * 0.15 : twoTone))) { comp.forEach((k) => (bg[k] = 1)); holes++; }
    if (globalThis.DBG && comp.length > 200) { let bx0 = W, by0 = H, bx1 = 0, by1 = 0; for (const k of comp) { const x = k % W, y = (k / W) | 0; bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
      dbg.push([comp.length, match, nA, nB, flatTone, bx0, by0, bx1, by1].join(',')); }
  }
  // 3) quitar el halo: píxeles grisáceos pegados al fondo
  for (let pass = 0; pass < 2; pass++) {
    const kill = [];
    for (let k = 0; k < W * H; k++) { if (bg[k]) continue; const i = k * 4; const r = d[i], g = d[i + 1], bl = d[i + 2];
      const gray = Math.max(r, g, bl) - Math.min(r, g, bl) <= 30 && (r + g + bl) / 3 >= 80;
      const x = k % W, y = (k / W) | 0;
      if (gray && ((x > 0 && bg[k - 1]) || (x < W - 1 && bg[k + 1]) || (y > 0 && bg[k - W]) || (y < H - 1 && bg[k + W]))) kill.push(k); }
    kill.forEach((k) => (bg[k] = 1));
  }
  // 4) motas sueltas: islas opacas pequeñas que quedan del tablero
  const seen2 = new Uint8Array(W * H); const comps = [];
  for (let s = 0; s < W * H; s++) {
    if (bg[s] || seen2[s]) continue;
    const comp = []; const st = [s]; seen2[s] = 1;
    while (st.length) { const k = st.pop(); comp.push(k); const x = k % W, y = (k / W) | 0;
      for (const n of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1]) if (n >= 0 && !seen2[n] && !bg[n]) { seen2[n] = 1; st.push(n); } }
    if (comp.length < 40) { comp.forEach((k) => (bg[k] = 1)); continue; }
    comps.push(comp);
  }
  // GLOW: en las partículas sueltas (notas, chispas), el halo pintado sobre el tablero pasa a ser un brillo translúcido
  let glowed = 0;
  // GLOW=2: el halo pintado se quita entero y se rehace como un resplandor suave (copia desenfocada del trazo)
  const glowMask = GLOW === '2' ? new Uint8Array(W * H) : null;
  if (GLOW === '2' && comps.length > 1) {
    const sorted = comps.slice().sort((a, b) => b.length - a.length);
    for (const comp of sorted.slice(1)) for (const k of comp) { const i = k * 4; const ch = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
      if (ch < 80) { bg[k] = 1; glowed++; } else glowMask[k] = 1; }
  } else if (GLOW && comps.length > 1) {
    const sorted = comps.slice().sort((a, b) => b.length - a.length);
    for (const comp of sorted.slice(1)) for (const k of comp) { const i = k * 4; const r = d[i], g = d[i + 1], bl = d[i + 2];
      const ch = Math.max(r, g, bl) - Math.min(r, g, bl); const l = (r + g + bl) / 3;
      if (ch < 90 && l >= 120) { const f = 2.4; d[i] = Math.max(0, Math.min(255, l + (r - l) * f)); d[i + 1] = Math.max(0, Math.min(255, l + (g - l) * f)); d[i + 2] = Math.max(0, Math.min(255, l + (bl - l) * f)); d[i + 3] = Math.max(30, Math.min(170, (ch - 8) * 3)); glowed++; } }
  }
  // en modo estricto, los trozos sueltos casi todo gris claro son restos del tablero (líneas fantasma)
  if (STRICT && comps.length > 1) {
    comps.sort((a, b) => b.length - a.length);
    for (const comp of comps.slice(1)) { let light = 0; for (const k of comp) { const i = k * 4; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) <= 30 && (d[i] + d[i + 1] + d[i + 2]) / 3 >= 140) light++; }
      let tone = 0; if (STRICT === '2') for (const k of comp) { const i = k * 4; const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) <= 24 && fp.some((t) => Math.abs(l - t) <= 22)) tone++; }
      if (light >= comp.length * 0.8 || tone >= comp.length * 0.7) comp.forEach((k) => (bg[k] = 1)); }
  }
  // CLEAR: dentro de un círculo, el tablero que asoma entre líneas finas (cuerdas, rejas). Apertura morfológica:
  // quita las manchas grises del tono del tablero y respeta las líneas de 1-3 px.
  if (CLEAR) { const [cx, cy, rr] = CLEAR; const M = new Uint8Array(W * H);
    for (let y = Math.max(0, cy - rr); y <= Math.min(H - 1, cy + rr); y++) for (let x = Math.max(0, cx - rr); x <= Math.min(W - 1, cx + rr); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue; const k = y * W + x; if (bg[k]) continue; const i = k * 4;
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) <= 24 && fp.some((t) => Math.abs(l - t) <= 24)) M[k] = 1; }
    const R = 2; const E = new Uint8Array(W * H);
    for (let y = R; y < H - R; y++) for (let x = R; x < W - R; x++) { if (!M[y * W + x]) continue; let ok = 1; for (let dy = -R; dy <= R && ok; dy++) for (let dx = -R; dx <= R; dx++) if (!M[(y + dy) * W + x + dx]) { ok = 0; break; } E[y * W + x] = ok; }
    for (let y = R; y < H - R; y++) for (let x = R; x < W - R; x++) { if (!E[y * W + x]) continue; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) bg[(y + dy) * W + x + dx] = 1; }
  }
  // 5) velo: círculo mágico translúcido pintado encima del tablero; el tablero teñido pasa a ser un velo cian semitransparente
  let veiled = 0;
  if (veil) { const [cx, cy, rr] = veil;
    for (let y = Math.max(0, cy - rr); y <= Math.min(H - 1, cy + rr); y++) for (let x = Math.max(0, cx - rr); x <= Math.min(W - 1, cx + rr); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue; const k = y * W + x; if (bg[k]) continue; const i = k * 4;
      const ch = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]); const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (l >= 80 && l <= 205 && ch <= 80) { d[i] = 90; d[i + 1] = 210; d[i + 2] = 230; d[i + 3] = 70; veiled++; } } }
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let k = 0; k < W * H; k++) { if (bg[k]) { d[k * 4 + 3] = 0; continue; } const x = k % W, y = (k / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  ctx.putImageData(id, 0, 0);
  if (glowMask) { // resplandor detrás de las partículas, de su propio color
    const gc = document.createElement('canvas'); gc.width = W; gc.height = H; const gctx = gc.getContext('2d'); const gd = gctx.createImageData(W, H);
    for (let k = 0; k < W * H; k++) if (glowMask[k] && !bg[k]) { gd.data.set(d.subarray(k * 4, k * 4 + 3), k * 4); gd.data[k * 4 + 3] = 255; }
    gctx.putImageData(gd, 0, 0);
    ctx.globalCompositeOperation = 'destination-over'; ctx.filter = 'blur(6px)'; ctx.drawImage(gc, 0, 0); ctx.drawImage(gc, 0, 0); ctx.filter = 'blur(2px)'; ctx.drawImage(gc, 0, 0);
    ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    x0 = Math.max(0, x0 - 8); y0 = Math.max(0, y0 - 8); x1 = Math.min(W - 1, x1 + 8); y1 = Math.min(H - 1, y1 + 8);
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const scale = Math.min(1, maxH / ch);
  const o = document.createElement('canvas'); o.width = Math.round(cw * scale); o.height = Math.round(ch * scale);
  const octx = o.getContext('2d'); octx.imageSmoothingQuality = 'high'; octx.drawImage(c, x0, y0, cw, ch, 0, 0, o.width, o.height);
  const preview = document.createElement('canvas'); preview.width = o.width; preview.height = o.height;
  const pctx = preview.getContext('2d'); pctx.fillStyle = '#1a0a10'; pctx.fillRect(0, 0, o.width, o.height); pctx.drawImage(o, 0, 0);
  return { glowed, grayMin, veiled, dbg, holes, pk, T, ph, phy, toneA, toneB, crop: [x0, y0, cw, ch], out: [o.width, o.height], webp: o.toDataURL('image/webp', 0.9), preview: preview.toDataURL('image/png') };
}, { src, maxH: Number(maxH), tint, DBG: !!process.env.DBG, BOX2: process.env.BOX2 ? process.env.BOX2.split(',').map(Number) : null, STRICT: process.env.STRICT ?? '', GLOW: process.env.GLOW ?? '', CLEAR: process.env.CLEAR ? process.env.CLEAR.split(',').map(Number) : null, HOLES: process.env.HOLES ? process.env.HOLES.split(';').map((r) => r.split(',').map(Number)) : null, ERASE: process.env.ERASE ? process.env.ERASE.split(';').map((r) => r.split(',').map(Number)) : null, veil: veil ? veil.split(',').map(Number) : null });
writeFileSync(output, Buffer.from(r.webp.split(',')[1], 'base64'));
writeFileSync(output.replace(/\.webp$/, '-preview.png'), Buffer.from(r.preview.split(',')[1], 'base64'));
if (r.dbg.length) console.log(r.dbg.join('\n'));
console.log(JSON.stringify({ glowed: r.glowed, grayMin: r.grayMin, veiled: r.veiled, holes: r.holes, pk: r.pk, T: r.T, ph: r.ph, phy: r.phy, tones: [r.toneA, r.toneB], crop: r.crop, out: r.out }));
await b.close();
