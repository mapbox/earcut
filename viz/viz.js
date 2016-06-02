'use strict';  /*eslint comma-spacing: 0, no-unused-vars: 0 */ /*global earcut:false */

var Pbf = require('pbf');
var VT = require('./vector-tile');
var earcut = require('../src/earcut.js');

var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

canvas.width = window.innerWidth - 2;
canvas.height = canvas.width;

var ratio = canvas.width / (4096 + 128 * 2);

if (devicePixelRatio > 1) {
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
    canvas.width *= 2;
    canvas.height *= 2;
    ctx.scale(2, 2);
}

var numOuter = 0;
var numHoles = 0;

ctx.lineJoin = 'round';


canvas.ondragover = function () {
    return false;
};
canvas.ondragend = function () {
    return false;
};
canvas.ondrop = function (e) {
    var reader = new FileReader();
    reader.onload = function (event) {
        var tile = VT.readTile(new Pbf(new Uint8Array(event.target.result)));
        // console.log(tile);

        for (var i = 0; i < tile.layers.length; i++) {
            var layer = tile.layers[i];
            console.log(layer.name);
            for (var j = 0; j < layer.features.length; j++) {
                var feature = layer.features[j];
                if (feature.type !== 3) continue;
                var polygons = classifyRings(feature.geometry);

                for (var k = 0; k < polygons.length; k++) {
                    var area = polygonArea(polygons[k]);
                    var data = flattenData(polygons[k]);
                    var result = earcut(data.vertices, data.holes, 2);

                    var triangles = [];
                    for (var m = 0; m < result.length; m++) {
                        var index = result[m];
                        triangles.push([data.vertices[index * 2], data.vertices[index * 2 + 1]]);
                    }

                    var triangleArea = 0;
                    for (m = 0; triangles && m < triangles.length; m += 3) {
                        triangleArea += ringArea(triangles.slice(m, m + 3));
                    }

                    var deviation = Math.abs(triangleArea - area) / area;

                    for (m = 0; triangles && m < triangles.length; m += 3) {
                        var triangle = [triangles.slice(m, m + 3)];
                        if (deviation === 0) drawPoly(triangle, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.05)');
                        else drawPoly(triangle, 'rgba(255,0,0,0.0)', 'rgba(255,0,0,0.3)');
                    }

                    if (deviation) console.log(JSON.stringify(polygons[k]));

                    drawPoly(polygons[k], 'rgba(0,0,0,0.5)');
                }
            }
        }

        console.log('outer', numOuter);
        console.log('hole', numHoles);
    };
    reader.readAsArrayBuffer(e.dataTransfer.files[0]);

    e.preventDefault();
    return false;
};

function drawPoly(rings, color, fill) {
    ctx.beginPath();

    ctx.strokeStyle = color;
    if (fill) ctx.fillStyle = fill;

    for (var k = 0; k < rings.length; k++) {
        var points = rings[k];
        for (var i = 0; i < points.length; i++) {
            var x = (points[i][0] + 128) * ratio,
                y = (points[i][1] + 128) * ratio;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }
    ctx.stroke();

    if (fill) ctx.fill('evenodd');
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

function classifyRings(rings) {
    var len = rings.length;

    if (len <= 1) return [rings];

    var polygons = [],
        polygon,
        outerArea;

    for (var i = 0; i < len; i++) {
        var area = signedArea(rings[i]);
        if (area === 0) throw new Error('zero area polygon');

        if (!outerArea || (outerArea < 0 === area < 0)) {
            if (polygon) polygons.push(polygon);
            polygon = [rings[i]];
            outerArea = area;
            numOuter++;

        } else {
            if (Math.abs(area) > Math.abs(outerArea)) throw new Error('Hole is bigger than outer ring!');
            polygon.push(rings[i]);
            numHoles++;
        }
    }
    if (polygon) polygons.push(polygon);

    return polygons;
}

function signedArea(ring) {
    var sum = 0;
    for (var i = 0, len = ring.length, j = len - 1, p1, p2; i < len; j = i++) {
        p1 = ring[i];
        p2 = ring[j];
        sum += (p2[0] - p1[0]) * (p1[1] + p2[1]);
    }
    return sum;
}

function ringArea(ring) {
    return Math.abs(signedArea(ring)) / 2;
}

function polygonArea(rings) {
    var sum = ringArea(rings[0]);
    for (var i = 1; i < rings.length; i++) {
        sum -= ringArea(rings[i]);
    }
    return sum;
}
