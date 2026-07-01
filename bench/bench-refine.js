// Benchmark the optional Delaunay refinement post-pass (refine() in src/earcut.js)
// over the same realistic MVT fixture as bench-tiles.js. Measures the added cost of
// refine() relative to earcut alone, and reports the resulting triangle quality.
//
// earcut is run ONCE per polygon at startup (untimed) and its index arrays are cached;
// refine() mutates its input in place, so the timed pass resets a reusable copy from the
// cache and refines that. This keeps earcut out of both the timing and the profile, so a
// `flamebearer-node bench/bench-refine.js` flame graph is dominated by refine() itself
// rather than burying it under two earcut passes.
import earcut, {refine} from '../src/earcut.js';
import {readTilesFixture} from './tiles-fixture.js';

const polys = readTilesFixture();
const totalVerts = polys.reduce((s, d) => s + d.vertices.length / d.dimensions, 0);

// earcut output cached once (untimed). `work` holds reusable copies refine() mutates in place.
const base = polys.map(d => earcut(d.vertices, d.holes, d.dimensions));
const work = base.map(t => t.slice());

// restore every work array to pristine earcut output (each timed refine must start from it)
function reset() {
    for (let i = 0; i < base.length; i++) {
        const w = work[i], b = base[i];
        for (let j = 0; j < b.length; j++) w[j] = b[j];
    }
}
function earcutAll() { let s = 0; for (const d of polys) s += earcut(d.vertices, d.holes, d.dimensions).length; return s; }
function refineAll() { let s = 0; for (let i = 0; i < work.length; i++) { refine(work[i], polys[i].vertices, polys[i].dimensions); s += work[i].length; } return s; }

// median wall time over 5 runs, matching bench-tiles' timeSet. `prep` (if given) runs untimed
// before each timed run — refine needs it to restore fresh earcut output into `work`, so the
// reported number is pure refine, no copy-cost pollution.
function timeSet(fn, prep) {
    const t = [];
    for (let i = 0; i < 5; i++) {
        if (prep) prep();
        const s = performance.now(); fn(); t.push(performance.now() - s);
    }
    t.sort((a, b) => a - b);
    return {median: t[2], lo: t[0], hi: t[4]};
}

// --- triangle quality (normalized q = 4√3·area / Σ edge², in [0,1]) ---
function quality(tris) {
    let slivers = 0, tinyAngle = 0, perim = 0, sumQ = 0, count = 0;
    for (let p = 0; p < polys.length; p++) {
        const c = polys[p].vertices, dim = polys[p].dimensions;
        const idx = tris[p];
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
            sumQ += q; count++;
        }
    }
    return {slivers, tinyAngle, perim, meanQ: sumQ / count, tris: count};
}

// warm both paths
earcutAll(); reset(); refineAll();

// Profiling mode: `REFINE_PROFILE=1 flamebearer-node bench/bench-refine.js` loops refine() only
// (no earcut, no quality pass) so the flame graph is ~all refine. reset() restores earcut output
// between reps and shows as a small, clearly-labeled copy loop.
if (process.env.REFINE_PROFILE) {
    for (let i = 0; i < 40; i++) { reset(); refineAll(); }
    process.exit(0);
}

const tEarcut = timeSet(earcutAll);
const tRefine = timeSet(refineAll, reset);
const overhead = tRefine.median / tEarcut.median * 100;

console.log(`fixture:  ${polys.length.toLocaleString()} polygons, ${totalVerts.toLocaleString()} vertices`);
console.log(`\nearcut:          ${tEarcut.median.toFixed(0)} ms   (${tEarcut.lo.toFixed(0)}–${tEarcut.hi.toFixed(0)} ms over 5 runs)`);
console.log(`refine:          ${tRefine.median.toFixed(0)} ms   (+${overhead.toFixed(0)}% over earcut, ${tRefine.lo.toFixed(0)}–${tRefine.hi.toFixed(0)} ms)`);

// `base` is pristine earcut output; `work` was refined by the last timed pass.
const qa = quality(base);
const qb = quality(work);
const pct = (x, y) => `${((y - x) / x * 100).toFixed(0)}%`;
console.log('\nquality:              earcut     refined    delta');
console.log(`  slivers (q<0.1)   ${String(qa.slivers).padStart(8)}  ${String(qb.slivers).padStart(8)}    ${pct(qa.slivers, qb.slivers)}`);
console.log(`  min-angle < 1deg  ${String(qa.tinyAngle).padStart(8)}  ${String(qb.tinyAngle).padStart(8)}    ${pct(qa.tinyAngle, qb.tinyAngle)}`);
console.log(`  total perimeter   ${qa.perim.toExponential(2).padStart(8)}  ${qb.perim.toExponential(2).padStart(8)}    ${pct(qa.perim, qb.perim)}`);
console.log(`  mean q            ${qa.meanQ.toFixed(3).padStart(8)}  ${qb.meanQ.toFixed(3).padStart(8)}    +${pct(qa.meanQ, qb.meanQ)}`);
console.log(`  triangles         ${qa.tris.toLocaleString()} (invariant: ${qa.tris === qb.tris})`);
