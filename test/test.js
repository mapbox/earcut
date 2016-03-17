'use strict';

var test = require('tape'),
    earcut = require('../src/earcut'),
    fs = require('fs'),
    path = require('path');

areaTest('building', 13);
areaTest('dude', 106);
areaTest('water', 2482, 0.0008);
areaTest('water2', 1212);
areaTest('water3', 197);
areaTest('water3b', 25);
areaTest('water4', 705);
areaTest('water-huge', 5174, 0.0011);
areaTest('water-huge2', 4461, 0.0028);
areaTest('degenerate', 0);
areaTest('bad-hole', 42, 0.019);
areaTest('empty-square', 0);
areaTest('issue16', 12);
areaTest('issue17', 11);
areaTest('steiner', 9);
areaTest('issue29', 40);
areaTest('issue34', 139);
areaTest('issue35', 844);
areaTest('self-touching', 124, 3.4e-14);
areaTest('outside-ring', 64);
areaTest('simplified-us-border', 120);
areaTest('touching-holes', 57);
areaTest('hole-touching-outer', 77);
areaTest('hilbert', 1024);
areaTest('issue45', 10);
areaTest('eberly-3', 73);
areaTest('eberly-6', 1429);
areaTest('issue52', 109);
areaTest('shared-points', 4);
areaTest('bad-diagonals', 7);

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

function areaTest(filename, expectedTriangles, expectedDeviation) {
    expectedDeviation = expectedDeviation || 1e-14;

    test(filename, function (t) {

        var data = earcut.flatten(JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + filename + '.json')))),
            indices = earcut(data.vertices, data.holes, data.dimensions),
            deviation = earcut.deviation(data.vertices, data.holes, data.dimensions, indices);

        t.ok(deviation < expectedDeviation,
            'deviation ' + formatPercent(deviation) + ' is less than ' + formatPercent(expectedDeviation));

        if (expectedTriangles) {
            var numTriangles = indices.length / 3;
            t.ok(numTriangles === expectedTriangles, numTriangles + ' triangles when expected ' + expectedTriangles);
        }

        t.end();
    });
}

function formatPercent(num) {
    return (Math.round(1e8 * num) / 1e6) + '%';
}
