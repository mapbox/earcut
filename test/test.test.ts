
import earcut, {flatten, deviation} from '../src/earcut.js';
import {expect, test} from "vitest"

const expected = await import("./expected.json", {with:{type: "json"}})

test('indices-2d', () => {
    const indices = earcut([10, 0, 0, 50, 60, 60, 70, 10]);
    expect(indices).toStrictEqual([1, 0, 3, 3, 2, 1]);
});

test('indices-3d', () => {
    const indices = earcut([10, 0, 0, 0, 50, 0, 60, 60, 0, 70, 10, 0], null, 3);
    expect(indices).toStrictEqual([1, 0, 3, 3, 2, 1]);
});

test('empty', () => {
    expect(earcut([])).toStrictEqual([]);
});

const keys = Object.keys(expected.triangles) as (keyof typeof expected.triangles)[]

for (const id of keys) {

    test(id, async () => {
      const {default:json} = await import("./fixtures/" + id + ".json", {with: {type: "json"}}) as {default: number[][][]};
      const data = flatten(json),
            indices = earcut(data.vertices, data.holes, data.dimensions),
            err = deviation(data.vertices, data.holes, data.dimensions, indices),
            expectedTriangles = expected.triangles[id],
            expectedDeviation = id in expected.errors ? expected.errors[id as keyof typeof expected.errors] : 0;

        const numTriangles = indices.length / 3;
        expect(numTriangles, `${numTriangles} triangles when expected ${expectedTriangles}`).toBe(expectedTriangles);

        if (expectedTriangles > 0) {
            expect(err, `deviation ${err} <= ${expectedDeviation}`).toBeLessThanOrEqual(expectedDeviation)
        }
    });
}

test('infinite-loop', () => {
    earcut([1, 2, 2, 2, 1, 2, 1, 1, 1, 2, 4, 1, 5, 1, 3, 2, 4, 2, 4, 1], [5], 2);
});
