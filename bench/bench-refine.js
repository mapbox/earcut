// Benchmark the optional Delaunay refinement post-pass (refine() in src/earcut.js)
// over the same realistic MVT fixture as bench-tiles.js. Measures the added cost of
// refine() relative to earcut alone, and reports the resulting triangle quality.
import earcut, {refine} from '../src/earcut.js';
import {readTilesFixture} from './tiles-fixture.js';

const polys = readTilesFixture();
const totalVerts = polys.reduce((s, d) => s + d.vertices.length / d.dimensions, 0);

// pre-triangulate once per poly so the timed paths only measure their own work;
// refine mutates the index array, so each timed pass re-triangulates a fresh copy.
function triOnly(d)    { return earcut(d.vertices, d.holes, d.dimensions).length; }
function triRefine(d)  { const t = earcut(d.vertices, d.holes, d.dimensions); refine(t, d.vertices, d.dimensions); return t.length; }

function run(fn) { let s = 0; for (const d of polys) s += fn(d); return s; }

// interleaved A/B (ABAB): cancels thermal drift instead of attributing it to one side.
function timeAB(a, b) {
    let ba = Infinity, bb = Infinity;
    for (let i = 0; i < 7; i++) {
        let s = performance.now(); run(a); ba = Math.min(ba, performance.now() - s);
        s = performance.now(); run(b); bb = Math.min(bb, performance.now() - s);
    }
    return {a: ba, b: bb};
}

// --- triangle quality (normalized q = 4√3·area / Σ edge², in [0,1]) ---
function quality(getIndices) {
    let slivers = 0, tinyAngle = 0, perim = 0, sumQ = 0, tris = 0;
    for (const d of polys) {
        const c = d.vertices, dim = d.dimensions;
        const idx = getIndices(d);
        for (let i = 0; i < idx.length; i += 3) {
            const ax = c[idx[i] * dim], ay = c[idx[i] * dim + 1];
            const bx = c[idx[i + 1] * dim], by = c[idx[i + 1] * dim + 1];
            const cx = c[idx[i + 2] * dim], cy = c[idx[i + 2] * dim + 1];
            const area = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
            const e1 = (bx - ax) ** 2 + (by - ay) ** 2;
            const e2 = (cx - bx) ** 2 + (cy - by) ** 2;
            const e3 = (ax - cx) ** 2 + (ay - cy) ** 2;
            const sumSq = e1 + e2 + e3;
            const q = sumSq > 0 ? 4 * Math.sqrt(3) * area / sumSq : 0;
            if (q < 0.1) slivers++;
            // smallest angle via law of cosines on the shortest-opposite side
            const la = Math.sqrt(e1), lb = Math.sqrt(e2), lc = Math.sqrt(e3);
            const angA = Math.acos(Math.min(1, Math.max(-1, (lb * lb + lc * lc - la * la) / (2 * lb * lc || 1))));
            const angB = Math.acos(Math.min(1, Math.max(-1, (la * la + lc * lc - lb * lb) / (2 * la * lc || 1))));
            const minAng = Math.min(angA, angB, Math.PI - angA - angB) * 180 / Math.PI;
            if (minAng < 1) tinyAngle++;
            perim += la + lb + lc;
            sumQ += q; tris++;
        }
    }
    return {slivers, tinyAngle, perim, meanQ: sumQ / tris, tris};
}

// warm both paths
run(triOnly); run(triRefine);

const {a: tEarcut, b: tRefine} = timeAB(triOnly, triRefine);
const overhead = (tRefine - tEarcut) / tEarcut * 100;

console.log(`fixture:  ${polys.length.toLocaleString()} polygons, ${totalVerts.toLocaleString()} vertices`);
console.log(`\nearcut:          ${tEarcut.toFixed(1)} ms`);
console.log(`earcut+refine:   ${tRefine.toFixed(1)} ms   (+${overhead.toFixed(0)}%, ${(tRefine - tEarcut).toFixed(1)} ms refine)`);

const qa = quality(d => earcut(d.vertices, d.holes, d.dimensions));
const qb = quality((d) => { const t = earcut(d.vertices, d.holes, d.dimensions); refine(t, d.vertices, d.dimensions); return t; });
const pct = (x, y) => `${((y - x) / x * 100).toFixed(0)}%`;
console.log('\nquality:              earcut     refined    delta');
console.log(`  slivers (q<0.1)   ${String(qa.slivers).padStart(8)}  ${String(qb.slivers).padStart(8)}    ${pct(qa.slivers, qb.slivers)}`);
console.log(`  min-angle < 1deg  ${String(qa.tinyAngle).padStart(8)}  ${String(qb.tinyAngle).padStart(8)}    ${pct(qa.tinyAngle, qb.tinyAngle)}`);
console.log(`  total perimeter   ${qa.perim.toExponential(2).padStart(8)}  ${qb.perim.toExponential(2).padStart(8)}    ${pct(qa.perim, qb.perim)}`);
console.log(`  mean q            ${qa.meanQ.toFixed(3).padStart(8)}  ${qb.meanQ.toFixed(3).padStart(8)}    +${pct(qa.meanQ, qb.meanQ)}`);
console.log(`  triangles         ${qa.tris.toLocaleString()} (invariant: ${qa.tris === qb.tris})`);
