// Benchmark earcut over a realistic set of MVT polygons. The fixture was generated
// from a local tile cache by a one-off, author-machine-specific script; regenerating
// it is intentionally out of scope for this repo.
import earcut from '../src/earcut.js';
import {readTilesFixture} from './tiles-fixture.js';

const polys = readTilesFixture(); // each: {vertices, holes, dimensions, z} ready for earcut

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
