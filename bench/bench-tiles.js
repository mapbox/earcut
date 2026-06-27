// Benchmark earcut over a realistic set of MVT polygons.
//
// Reads bench/tiles-fixture.bin: length-delimited packed-varint MVT geometry blobs,
// one per polygon feature. Decodes them here with a small varint reader (no pbf
// dependency), reconstructs polygons (splitting multipolygons and classifying holes by
// signed area, per the MVT spec), then times triangulating all of them. Reports the
// polygon-size distribution so the fixture's representativeness is visible, plus
// throughput + checksum.
//
// tiles-fixture.bin format (little-endian LEB128 unsigned varints throughout):
//
//   file    := tile*                     (repeated until EOF)
//   tile    := zoom featureCount feature*
//   feature := geomLen geom              (geomLen = number of varints in geom)
//   geom    := uint32*                   (raw MVT command/parameter integers)
//
// The geom integers are the native MVT polygon encoding: MoveTo/LineTo/ClosePath
// command-integers interleaved with zigzag delta-encoded coordinate pairs (decoded by
// decodeRings below). The fixture was generated from a local tile cache by a one-off,
// author-machine-specific script (not committed: it points at a sibling pbf checkout
// and its downloaded tile cache, so it isn't externally reproducible). Regenerating the
// fixture is therefore intentionally out of scope for this repo.
import {readFileSync} from 'fs';
import earcut, {flatten} from '../src/earcut.js';

const buf = readFileSync(new URL('./tiles-fixture.bin', import.meta.url));

// --- decode the binary fixture into flattened polygons ---
function zz(n) { return (n >> 1) ^ (-(n & 1)); }

// decode an MVT geometry command array into rings
function decodeRings(geom) {
    const rings = [];
    let x = 0, y = 0, ring = null, i = 0;
    while (i < geom.length) {
        const cmd = geom[i] & 0x7, count = geom[i] >> 3;
        i++;
        if (cmd === 1) { // MoveTo
            for (let k = 0; k < count; k++) {
                x += zz(geom[i++]); y += zz(geom[i++]);
                if (ring) rings.push(ring);
                ring = [[x, y]];
            }
        } else if (cmd === 2) { // LineTo
            for (let k = 0; k < count; k++) { x += zz(geom[i++]); y += zz(geom[i++]); ring.push([x, y]); }
        } else if (cmd === 7) { // ClosePath
            if (ring) { rings.push(ring); ring = null; }
        }
    }
    if (ring) rings.push(ring);
    return rings;
}

function ringArea(ring) { // exterior > 0, hole < 0
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        sum += (ring[j][0] - ring[i][0]) * (ring[i][1] + ring[j][1]);
    }
    return sum / 2;
}

const polys = []; // each: {vertices, holes, dimensions, z} ready for earcut
let pos = 0;
function readVarint() {
    let val = 0, shift = 0, b;
    do { b = buf[pos++]; val |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    return val >>> 0;
}

// decode per the format documented in the header comment
while (pos < buf.length) {
    const z = readVarint();
    const features = readVarint();
    for (let fi = 0; fi < features; fi++) {
        const count = readVarint();
        const geom = new Array(count);
        for (let k = 0; k < count; k++) geom[k] = readVarint();
        // split into polygons: each exterior ring (area > 0) starts a new one
        let current = null;
        const push = (rings) => { const d = flatten(rings); d.z = z; polys.push(d); };
        for (const ring of decodeRings(geom)) {
            if (ring.length < 3) continue;
            const a = ringArea(ring);
            if (a === 0) continue;
            if (a > 0) {
                if (current) push(current);
                current = [ring];
            } else if (current) {
                current.push(ring);
            }
        }
        if (current) push(current);
    }
}

// --- distribution (representativeness check) ---
const vc = polys.map(p => p.vertices.length / p.dimensions).sort((a, b) => a - b);
const q = f => vc[Math.min(vc.length - 1, Math.floor(f * vc.length))];
const withHoles = polys.filter(p => p.holes.length > 0).length;
const totalVerts = vc.reduce((a, b) => a + b, 0);

console.log(`fixture:  ${polys.length.toLocaleString()} polygons, ${totalVerts.toLocaleString()} vertices`);
console.log(`          ${(100 * withHoles / polys.length).toFixed(1)}% with holes`);
console.log(`          verts/poly: median ${q(.5)}, p90 ${q(.9)}, p99 ${q(.99)}, max ${vc[vc.length - 1]}`);

// --- timing ---
// lean timed path: just triangulate. kept free of any extra work so timing measures
// earcut alone (the checksum is computed separately, outside the timing loop).
function run(set) {
    let tris = 0;
    for (const d of set) tris += earcut(d.vertices, d.holes, d.dimensions).length;
    return tris;
}

// position-weighted fold over all indices: a sensitive drift signal (catches reordered/
// changed triangulations, not just gross breakage). Run once, never inside timing.
function checksum(set) {
    let sum = 0;
    for (const d of set) {
        const idx = earcut(d.vertices, d.holes, d.dimensions);
        for (let i = 0; i < idx.length; i++) sum = (sum + idx[i] * (i + 1)) >>> 0;
    }
    return sum;
}
// median wall time over a set. Assumes the JIT/caches are already primed: the overall
// pass is warmed by the tris + checksum runs before it, and the per-zoom slices are
// warmed by that overall pass (they're subsets of the same polygons).
function timeSet(set) {
    const t = [];
    for (let i = 0; i < 5; i++) { const s = performance.now(); run(set); t.push(performance.now() - s); }
    t.sort((a, b) => a - b);
    return {median: t[2], lo: t[0], hi: t[4]};
}

const tris = run(polys);
const sum = checksum(polys);
const overall = timeSet(polys);

console.log(`\nresult:   ${(tris / 3).toLocaleString()} triangles (checksum ${sum})`);
console.log(`time:     ${overall.median.toFixed(0)} ms   (${overall.lo.toFixed(0)}–${overall.hi.toFixed(0)} ms over 5 runs)`);
console.log(`speed:    ${Math.round(polys.length / (overall.median / 1000)).toLocaleString()} polygons/s, ` +
            `${(totalVerts / (overall.median / 1000) / 1e6).toFixed(1)}M verts/s`);

// --- per-zoom breakdown ---
const byZoom = new Map();
for (const d of polys) {
    if (!byZoom.has(d.z)) byZoom.set(d.z, []);
    byZoom.get(d.z).push(d);
}
const zooms = [...byZoom.keys()].sort((a, b) => a - b);
console.log('\nper zoom:');
console.log('  z   polygons      verts   med.v   time     %time   polys/s');
for (const z of zooms) {
    const set = byZoom.get(z);
    const v = set.map(d => d.vertices.length / d.dimensions).sort((a, b) => a - b);
    const verts = v.reduce((a, b) => a + b, 0);
    const med = v[Math.floor(v.length / 2)];
    const {median} = timeSet(set); // already warm from the overall pass
    const pct = 100 * median / overall.median;
    console.log(
        `  ${String(z).padStart(2)}  ${set.length.toLocaleString().padStart(8)}  ` +
        `${verts.toLocaleString().padStart(9)}  ${String(med).padStart(5)}  ` +
        `${median.toFixed(0).padStart(5)} ms  ${pct.toFixed(1).padStart(5)}%  ` +
        `${Math.round(set.length / (median / 1000)).toLocaleString().padStart(8)}`);
}
