var test = require('tape'),
    earcut = require('../src/earcut'),
    fs = require('fs');

areaTest('building', 1e-6);
areaTest('dude', 1e-6);
areaTest('water', 0.0011);
areaTest('water2', 0.0002);
areaTest('water3', 1e-6);
areaTest('water4', 1e-6);
areaTest('water-huge', 0.001);

function areaTest(filename, expectedDeviation) {
    test(filename, function (t) {
        var data = JSON.parse(fs.readFileSync(__dirname + '/fixtures/' + filename + '.json'));
        var triangles = earcut(data);
        var area = 0;
        for (var i = 0; i < triangles.length; i += 3) {
            area += ringArea([triangles[i], triangles[i + 1], triangles[i + 2]]);
        }
        var expectedArea = polygonArea(data);
        var deviation = Math.abs(area - expectedArea) / expectedArea;
        t.ok(deviation < expectedDeviation,
            'deviation ' + formatPercent(deviation) + ' is less than ' + formatPercent(expectedDeviation));
        t.end();
    });
}

function formatPercent(num) {
    return (Math.round(1e8 * num) / 1e6) + '%';
}

function ringArea(points) {
    var sum = 0;
    for (var i = 0, len = points.length, j = len - 1; i < len; j = i++) {
        sum += (points[i][0] - points[j][0]) * (points[i][1] + points[j][1]);
    }
    return Math.abs(sum);
}

function polygonArea(rings) {
    var sum = ringArea(rings[0]);
    for (var i = 1; i < rings.length; i++) {
        sum -= ringArea(rings[i]);
    }
    return sum;
}
