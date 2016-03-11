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

var data = earcut.flatten(testPoints);

console.time('earcut');
// for (var i = 0; i < 1000; i++) {
var result = earcut(data.vertices, data.holes, data.dimensions);
// }
console.timeEnd('earcut');

var triangles = [];
for (i = 0; i < result.length; i++) {
    var index = result[i];
    triangles.push([data.vertices[index * data.dimensions], data.vertices[index * data.dimensions + 1]]);
}
>>>>>>> master

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
