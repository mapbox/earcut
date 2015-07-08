'use strict';

var test = require('tape'),
    earcut = require('../src/earcut'),
    fs = require('fs'),
    path = require('path');

areaTest('building', 12);
areaTest('dude', 106);
areaTest('water', 2482, 0.0019);
areaTest('water2', 1211);
areaTest('water3', 197);
areaTest('water3b', 25);
areaTest('water4', 705);
areaTest('water-huge', 5162, 0.0015);
areaTest('water-huge2', 4456, 0.0020);
areaTest('degenerate', 0);
areaTest('bad-hole', 34, 0.0420);
areaTest('empty-square', 0);
areaTest('issue16', 12);
areaTest('issue17', 11);
areaTest('steiner', 9);
areaTest('issue29', 40);

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

function areaTest(filename, expectedTriangles, expectedDeviation) {
    expectedDeviation = expectedDeviation || 1e-14;

    test(filename, function (t) {

        var data = JSON.parse(fs.readFileSync(path.join(__dirname, '/fixtures/' + filename + '.json'))),
            data2 = flattenData(data),
            vertices = data2.vertices,
            holes = data2.holes,
            dim = data2.dimensions,
            indices = earcut(vertices, holes, dim),
            expectedArea = polygonArea(data),
            area = 0;

        for (var i = 0; i < indices.length; i += 3) {
            area += triangleArea(
                [vertices[dim * indices[i]], vertices[dim * indices[i] + 1]],
                [vertices[dim * indices[i + 1]], vertices[dim * indices[i + 1] + 1]],
                [vertices[dim * indices[i + 2]], vertices[dim * indices[i + 2] + 1]]);
        }

        var deviation = expectedArea === 0 && area === 0 ? 0 : Math.abs(area - expectedArea) / expectedArea;

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

function triangleArea(a, b, c) {
    return Math.abs((a[0] - c[0]) * (b[1] - a[1]) - (a[0] - b[0]) * (c[1] - a[1])) / 2;
}

function ringArea(points) {
    var sum = 0;
    for (var i = 0, len = points.length, j = len - 1; i < len; j = i++) {
        sum += (points[i][0] - points[j][0]) * (points[i][1] + points[j][1]);
    }
    return Math.abs(sum) / 2;
}

function polygonArea(rings) {
    var sum = ringArea(rings[0]);
    for (var i = 1; i < rings.length; i++) {
        sum -= ringArea(rings[i]);
    }
    return sum;
}
