
const test = require('tape');
const earcut = require('../src/earcut');
const fs = require('fs');
const path = require('path');
const expected = require('./expected.json');

test('indices-2d', (t) => {
    const indices = earcut([10, 0, 0, 50, 60, 60, 70, 10]);
    t.same(indices, [1, 0, 3, 3, 2, 1]);
    t.end();
});

test('indices-3d', (t) => {
    const indices = earcut([10, 0, 0, 0, 50, 0, 60, 60, 0, 70, 10, 0], null, 3);
    t.same(indices, [1, 0, 3, 3, 2, 1]);
    t.end();
});

test('empty', (t) => {
    t.same(earcut([]), []);
    t.end();
});

Object.keys(expected.triangles).forEach((id) => {

    test(id, (t) => {
        const data = earcut.flatten(JSON.parse(fs.readFileSync(path.join(__dirname, `/fixtures/${id}.json`))));
        const indices = earcut(data.vertices, data.holes, data.dimensions);
        const deviation = earcut.deviation(data.vertices, data.holes, data.dimensions, indices);
        const expectedTriangles = expected.triangles[id];
        const expectedDeviation = expected.errors[id] || 0;

        const numTriangles = indices.length / 3;
        t.ok(numTriangles === expectedTriangles, `${numTriangles} triangles when expected ${expectedTriangles}`);

        if (expectedTriangles > 0) {
            t.ok(deviation <= expectedDeviation, `deviation ${deviation} <= ${expectedDeviation}`);
        }

        t.end();
    });
});
