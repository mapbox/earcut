'use strict';

var test = require('tape'),
    earcut = require('../src/earcut'),
    fs = require('fs'),
    path = require('path'),
    expected = require('./expected.json');

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
        var data = earcut.flatten(JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + id + '.json')))),
            indices = earcut(data.vertices, data.holes, data.dimensions),
            deviation = earcut.deviation(data.vertices, data.holes, data.dimensions, indices),
            expectedTriangles = expected.triangles[id],
            expectedDeviation = expected.errors[id] || 0;

        var numTriangles = indices.length / 3;
        t.ok(numTriangles === expectedTriangles, numTriangles + ' triangles when expected ' + expectedTriangles);

        if (expectedTriangles > 0) {
            t.ok(deviation <= expectedDeviation,
                'deviation ' + deviation + ' <= ' + expectedDeviation);
        }

        t.end();
    });
});
