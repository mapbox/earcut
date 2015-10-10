var vt2geojson = require('vt2geojson');
var earcut = require('../../');

function test(data) {
    var expectedDeviation = 1000;
    var flat = flattenData(data),
        vertices = flat.vertices,
        holes = flat.holes,
        dim = flat.dimensions,
        indices = earcut(vertices, holes, dim),
        expectedArea = polygonArea(data),
        area = 0;

    for (var i = 0; i < indices.length; i += 3) {
        area += triangleArea(
            [vertices[dim * indices[i]], vertices[dim * indices[i] + 1]],
            [vertices[dim * indices[i + 1]], vertices[dim * indices[i + 1] + 1]],
            [vertices[dim * indices[i + 2]], vertices[dim * indices[i + 2] + 1]]);
    }

    var deviation = expectedArea === 0 && area === 0 ? 0 : area - expectedArea;

    return {
        expected: expectedArea,
        actual: area,
        deviation: deviation,
        ok: deviation < expectedDeviation,
        diff: area - expectedArea,
        log: area + ' vs ' + expectedArea + ', deviation: ' + deviation
    };
}

function areaTest(data) {

    for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].length; j++) {
            data[i][j] = [data[i][j].x, data[i][j].y];
        }
    }

    var result = test(data);
    console.log(result.log);

    if (!result.ok) {
        for (var i = 1; i < data.length; ) {
            var data2 = data.slice();
            data2.splice(i, 1);
            if (!test(data2).ok) {
                data = data2;
            } else {
                i++;
            }
        }

        console.log(JSON.stringify(data));
    }
}

function flattenData(data) {
    var dim = 2,
        result = {vertices: [], holes: [], dimensions: dim},
        holeIndex = 0;

    for (var i = 0; i < data.length; i++) {
        for (var j = 0; j < data[i].length; j++) {
            result.vertices.push(data[i][j][0]);
            result.vertices.push(data[i][j][1]);
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

vt2geojson({
    url: 'https://api.mapbox.com/v4/mapbox.mapbox-streets-v6/6/17/26.vector.pbf?access_token=pk.eyJ1IjoiamZpcmUiLCJhIjoiVkRqZHhXTSJ9.k3r6TYm9oetgLQX0A_nQbQ',
    layer: 'water'
}, function (err, result) {
    if (err) throw err;
    result.features.forEach(function (feature, i) {
        if (feature.geometry.type === 'Polygon') {
            areaTest(feature.coordinates[0], i);
        } else if (feature.geometry.type === 'MultiPolygon') {
            feature.coordinates.forEach(function(polygon) {
                areaTest(polygon, i);
            });
        }
    });
});
