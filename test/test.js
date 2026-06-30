
import test from 'node:test';
import assert from 'node:assert/strict';
import earcut, {flatten, deviation, refine} from '../src/earcut.js';
import fs from 'fs';
import expected from './expected.json' with {type: 'json'};
import {readTilesFixture} from '../bench/tiles-fixture.js';

test('indices-2d', () => {
    const indices = earcut([10, 0, 0, 50, 60, 60, 70, 10]);
    assert.deepEqual(indices, [1, 0, 3, 1, 3, 2]);
});

test('indices-3d', () => {
    const indices = earcut([10, 0, 0, 0, 50, 0, 60, 60, 0, 70, 10, 0], null, 3);
    assert.deepEqual(indices, [1, 0, 3, 1, 3, 2]);
});

test('empty', () => {
    assert.deepEqual(earcut([]), []);
});

// tracks the worst deviation across the three non-zero rotations per fixture,
// so we can tell when the errors-with-rotation bound can be tightened
const maxRotated = new Map();

function trianglePerimeter(triangles, vertices, dim = 2) {
    let perimeter = 0;
    for (let i = 0; i < triangles.length; i += 3) {
        const ax = vertices[triangles[i] * dim],
            ay = vertices[triangles[i] * dim + 1],
            bx = vertices[triangles[i + 1] * dim],
            by = vertices[triangles[i + 1] * dim + 1],
            cx = vertices[triangles[i + 2] * dim],
            cy = vertices[triangles[i + 2] * dim + 1];

        perimeter += Math.hypot(ax - bx, ay - by) +
            Math.hypot(bx - cx, by - cy) +
            Math.hypot(cx - ax, cy - ay);
    }
    return perimeter;
}

for (const id of Object.keys(expected.triangles)) {

    for (const rotation of [0, 90, 180, 270]) {
        test(`${id} rotation ${rotation}`, (t) => {
            const coords = JSON.parse(fs.readFileSync(new URL(`fixtures/${id}.json`, import.meta.url)));
            const theta = rotation * Math.PI / 180;
            const xx = Math.round(Math.cos(theta));
            const xy = Math.round(-Math.sin(theta));
            const yx = Math.round(Math.sin(theta));
            const yy = Math.round(Math.cos(theta));
            if (rotation) {
                for (const ring of coords) {
                    for (const coord of ring) {
                        const [x, y] = coord;
                        coord[0] = xx * x + xy * y;
                        coord[1] = yx * x + yy * y;
                    }
                }
            }
            const data = flatten(coords),
                indices = earcut(data.vertices, data.holes, data.dimensions),
                err = deviation(data.vertices, data.holes, data.dimensions, indices),
                expectedTriangles = expected.triangles[id],
                expectedDeviation = (rotation !== 0 && expected['errors-with-rotation'][id]) || expected.errors[id] || 0;

            const numTriangles = indices.length / 3;
            if (rotation === 0) {
                assert.ok(numTriangles === expectedTriangles, `${numTriangles} triangles when expected ${expectedTriangles}`);
            }

            if (expectedTriangles > 0) {
                assert.ok(err <= expectedDeviation, `deviation ${err} <= ${expectedDeviation}`);
            }

            // surface fixtures whose deviation is well below the recorded threshold (at least 3x),
            // so improvements after a correctness fix are visible and the threshold can be tightened;
            // for rotations, compare the worst of the three against the shared errors-with-rotation bound
            if (rotation === 0) {
                if (expectedDeviation > 0 && err * 3 < expectedDeviation) {
                    t.diagnostic(`${id}: deviation ${err} < recorded ${expectedDeviation} (improved)`);
                }
            } else {
                maxRotated.set(id, Math.max(maxRotated.get(id) || 0, err));
                if (rotation === 270 && expectedDeviation > 0 && maxRotated.get(id) * 3 < expectedDeviation) {
                    t.diagnostic(`${id} rotated: max deviation ${maxRotated.get(id)} < recorded ${expectedDeviation} (improved)`);
                }
            }
        });
    }
}

test('infinite-loop', () => {
    earcut([1, 2, 2, 2, 1, 2, 1, 1, 1, 2, 4, 1, 5, 1, 3, 2, 4, 2, 4, 1], [5], 2);
});

test('refine improves a bad quad diagonal', () => {
    const vertices = [0, 0, 3, 0, 10, 1, 0, 2];
    const triangles = [2, 3, 0, 2, 0, 1];
    const beforePerimeter = trianglePerimeter(triangles, vertices);
    refine(triangles, vertices);
    const afterPerimeter = trianglePerimeter(triangles, vertices);

    assert.deepEqual(triangles, [2, 3, 1, 3, 0, 1]);
    assert.ok(afterPerimeter < beforePerimeter * 0.7);
    assert.equal(deviation(vertices, null, 2, triangles), 0);
});

test('refine leaves a good quad diagonal alone', () => {
    const vertices = [0, 0, 5, 0, 4, 1, 0, 4];
    const triangles = [2, 3, 0, 2, 0, 1];

    refine(triangles, vertices);

    assert.deepEqual(triangles, [2, 3, 0, 2, 0, 1]);
    assert.equal(deviation(vertices, null, 2, triangles), 0);
});

test('refine preserves a concave polygon', () => {
    const vertices = [0, 0, 4, 0, 4, 1, 1, 1, 1, 4, 0, 4];
    const triangles = earcut(vertices);
    const length = triangles.length;
    const beforePerimeter = trianglePerimeter(triangles, vertices);
    refine(triangles, vertices);
    const afterPerimeter = trianglePerimeter(triangles, vertices);

    assert.equal(triangles.length, length);
    assert.ok(afterPerimeter < beforePerimeter * 0.9);
    assert.equal(deviation(vertices, null, 2, triangles), 0);
});

test('mvt fixture has zero deviation and refined quality', () => {
    const polys = readTilesFixture();
    let nonzero = 0;
    let firstIndex = -1;
    let firstDev = 0;
    let worstIndex = -1;
    let worstDev = 0;
    let sumDev = 0;
    let refinedNonzero = 0;
    let refinedFirstIndex = -1;
    let refinedFirstDev = 0;
    let refinedWorstIndex = -1;
    let refinedWorstDev = 0;
    let refinedSumDev = 0;
    let lengthChanged = 0;
    let basePerimeter = 0;
    let refinedPerimeter = 0;

    for (let i = 0; i < polys.length; i++) {
        const data = polys[i];
        const triangles = earcut(data.vertices, data.holes, data.dimensions);
        const length = triangles.length;
        basePerimeter += trianglePerimeter(triangles, data.vertices, data.dimensions);
        const dev = deviation(data.vertices, data.holes, data.dimensions, triangles);
        if (dev !== 0) {
            if (firstIndex < 0) {
                firstIndex = i;
                firstDev = dev;
            }
            nonzero++;
            sumDev += dev;
            if (dev > worstDev) {
                worstIndex = i;
                worstDev = dev;
            }
        }

        refine(triangles, data.vertices, data.dimensions);
        refinedPerimeter += trianglePerimeter(triangles, data.vertices, data.dimensions);
        if (triangles.length !== length) lengthChanged++;

        const refinedDev = deviation(data.vertices, data.holes, data.dimensions, triangles);
        if (refinedDev !== 0) {
            if (refinedFirstIndex < 0) {
                refinedFirstIndex = i;
                refinedFirstDev = refinedDev;
            }
            refinedNonzero++;
            refinedSumDev += refinedDev;
            if (refinedDev > refinedWorstDev) {
                refinedWorstIndex = i;
                refinedWorstDev = refinedDev;
            }
        }
    }

    assert.equal(polys.length, 119680);
    assert.equal(nonzero, 0,
        `${nonzero} polygons with nonzero deviation; first ${firstIndex}: ${firstDev}, ` +
        `worst ${worstIndex}: ${worstDev}, sum ${sumDev}`);

    assert.equal(lengthChanged, 0, `${lengthChanged} refined triangulations changed triangle count`);
    assert.equal(refinedNonzero, 0,
        `${refinedNonzero} refined polygons with nonzero deviation; first ${refinedFirstIndex}: ${refinedFirstDev}, ` +
        `worst ${refinedWorstIndex}: ${refinedWorstDev}, sum ${refinedSumDev}`);

    assert.ok(refinedPerimeter < basePerimeter * 0.76, `refined perimeter ratio ${refinedPerimeter / basePerimeter} < 0.76`);
});

// Regression for the hole-bridge block index (issue #183): a collinear-rich outer ring
// (integer grid, like MVT data) plus multiple holes used to drop a hole when filterPoints
// healed a collinear run across a block boundary, leaving the surviving edge outside its
// block's stale bbox so the leftward-ray scan false-skipped it. Assert full coverage.
test('block-index-collinear', () => {
    const N = 30;
    const outer = [];
    for (let x = 0; x <= N; x++) outer.push([x, 0]);
    for (let y = 1; y <= N; y++) outer.push([N, y]);
    for (let x = N - 1; x >= 0; x--) outer.push([x, N]);
    for (let y = N - 1; y >= 1; y--) outer.push([0, y]);
    const rect = (x0, y0, w, h) => [[x0, y0], [x0, y0 + h], [x0 + w, y0 + h], [x0 + w, y0]];
    const rings = [outer, rect(5, 5, 2, 4), rect(2, 23, 1, 1)];

    for (const rotation of [0, 90, 180, 270]) {
        const theta = rotation * Math.PI / 180;
        const xx = Math.round(Math.cos(theta)), xy = Math.round(-Math.sin(theta));
        const yx = Math.round(Math.sin(theta)), yy = Math.round(Math.cos(theta));
        const rotated = rings.map(ring => ring.map(([x, y]) => [xx * x + xy * y, yx * x + yy * y]));
        const data = flatten(rotated);
        const indices = earcut(data.vertices, data.holes, data.dimensions);
        const err = deviation(data.vertices, data.holes, data.dimensions, indices);
        assert.ok(err < 1e-9, `rotation ${rotation}: deviation ${err} (hole dropped?)`);
    }
});
