var test = require('tape'),
    earcut = require('../src/earcut'),
    fs = require('fs');

areaTest('building');
areaTest('dude');
areaTest('water', 0.0021);
areaTest('water2');
areaTest('water3');
areaTest('water3b');
areaTest('water4');
areaTest('water-huge', 0.0021);
areaTest('water-huge2', 0.0023);
areaTest('degenerate');
areaTest('bad-hole', 0.05);
areaTest('empty-square');

function areaTest(filename, expectedDeviation) {
    expectedDeviation = expectedDeviation || 0.000001;

    test(filename, function (t) {

        var data = JSON.parse(fs.readFileSync(__dirname + '/fixtures/' + filename + '.json')),
            result = earcut(data),
            vertices = result.vertices,
            indices = result.indices,
            expectedArea = polygonArea(data),
            area = 0;

        for (var i = 0; i < indices.length; i += 3) {
            area += triangleArea(
                [vertices[indices[i]], vertices[indices[i] + 1]],
                [vertices[indices[i + 1]], vertices[indices[i + 1] + 1]],
                [vertices[indices[i + 2]], vertices[indices[i + 2] + 1]]);
        }

        var deviation = expectedArea === 0 && area === 0 ? 0 : Math.abs(area - expectedArea) / expectedArea;

        t.ok(deviation < expectedDeviation,
            'deviation ' + formatPercent(deviation) + ' is less than ' + formatPercent(expectedDeviation));

        t.end();
    });
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
