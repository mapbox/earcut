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
areaTest('water-huge', 5159, 0.007);
areaTest('water-huge2', 4456, 0.0019);
areaTest('degenerate', 0);
areaTest('bad-hole', 42, 0.019);
areaTest('empty-square', 0);
areaTest('issue16', 12);
areaTest('issue17', 11);
areaTest('steiner', 9);
areaTest('issue29', 40);
areaTest('issue34', 138);
areaTest('issue35', 841);
areaTest('self-touching', 124, 3.4e-14);
areaTest('outside-ring', 64);
areaTest('simplified-us-border', 120);
areaTest('touching-holes', 57);
areaTest('hole-touching-outer', 77);
areaTest('hilbert', 1023);
areaTest('issue45', 10);
areaTest('eberly-6', 1428);

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

        var data = JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + filename + '.json'))),
            data2 = flattenData(data),
            vertices = data2.vertices,
            holes = data2.holes,
            dim = data2.dimensions,
            indices = earcut(vertices, holes, dim),
            deviation = earcut.deviation(vertices, holes, dim, indices);

        t.ok(deviation < expectedDeviation,
            'deviation ' + formatPercent(deviation) + ' is less than ' + formatPercent(expectedDeviation));

        if (expectedTriangles) {
            t.ok(indices.length / 3 === expectedTriangles, (indices.length / 3) + ' triangles when expected ' +
                expectedTriangles);
        }

        t.end();
    });
}

function flattenData(data) {
    var dim = data[0][0].length,
        result = {vertices: [], holes: [], dimensions: dim},
        holeIndex = 0;

    for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].length; j++) {
            for (var d = 0; d < dim; d++) result.vertices.push(data[i][j][d]);
        }
        if (i > 0) {
            holeIndex += data[i - 1].length;
            result.holes.push(holeIndex);
        }
    }

    return result;
}

function formatPercent(num) {
    return (Math.round(1e8 * num) / 1e6) + '%';
}
