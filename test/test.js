
import test from 'tape';
import {earcut, flatten, deviation} from '../src/earcut.js';
import fs from 'fs';

const expected = JSON.parse(fs.readFileSync(new URL('expected.json', import.meta.url)));

test('indices-2d', function (t) {
    var indices = earcut([10, 0, 0, 50, 60, 60, 70, 10]);
    t.same(indices, [1, 0, 3, 3, 2, 1]);
    t.end();
});

test('indices-3d', function (t) {
    var indices = earcut([10, 0, 0, 0, 50, 0, 60, 60, 0, 70, 10, 0], null, 3);
    t.same(indices, [1, 0, 3, 3, 2, 1]);
    t.end();
});

test('empty', function (t) {
    t.same(earcut([]), []);
    t.end();
});

Object.keys(expected.triangles).forEach(function (id) {

    test(id, function (t) {
        var data = flatten(JSON.parse(fs.readFileSync(new URL(`fixtures/${id}.json`, import.meta.url)))),
            indices = earcut(data.vertices, data.holes, data.dimensions),
            err = deviation(data.vertices, data.holes, data.dimensions, indices),
            expectedTriangles = expected.triangles[id],
            expectedDeviation = expected.errors[id] || 0;

        var numTriangles = indices.length / 3;
        t.ok(numTriangles === expectedTriangles, numTriangles + ' triangles when expected ' + expectedTriangles);

        if (expectedTriangles > 0) {
            t.ok(err <= expectedDeviation,
                'deviation ' + err + ' <= ' + expectedDeviation);
        }

        t.end();
    });
});

test('infinite-loop', function (t) {
    earcut([1, 2, 2, 2, 1, 2, 1, 1, 1, 2, 4, 1, 5, 1, 3, 2, 4, 2, 4, 1], [5], 2);
    t.end();
});
