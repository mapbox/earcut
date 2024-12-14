
import test from 'node:test';
import assert from 'node:assert/strict';
import earcut, {flatten, deviation} from '../src/earcut.js';
import fs from 'fs';

const expected = JSON.parse(fs.readFileSync(new URL('expected.json', import.meta.url)));

test('indices-2d', () => {
    const indices = earcut([10, 0, 0, 50, 60, 60, 70, 10]);
    assert.deepEqual(indices, [1, 0, 3, 3, 2, 1]);
});

test('indices-3d', () => {
    const indices = earcut([10, 0, 0, 0, 50, 0, 60, 60, 0, 70, 10, 0], null, 3);
    assert.deepEqual(indices, [1, 0, 3, 3, 2, 1]);
});

test('empty', () => {
    assert.deepEqual(earcut([]), []);
});

for (const id of Object.keys(expected.triangles)) {

    for (const rotation of [0, 90, 180, 270]) {
        test(`${id} rotation ${rotation}`, () => {
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
        });
    }
}

test('infinite-loop', () => {
    earcut([1, 2, 2, 2, 1, 2, 1, 1, 1, 2, 4, 1, 5, 1, 3, 2, 4, 2, 4, 1], [5], 2);
});
