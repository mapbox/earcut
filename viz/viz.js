/*eslint @stylistic/js/comma-spacing: 0, no-unused-vars: 0 */

import earcut, {flatten, deviation} from '../src/earcut.js';

(async function () {
    const params = new URLSearchParams(window.location.search.substring(1));
    const fixture = params.get('fixture') || 'water';
    const testPoints = await (await fetch(`../test/fixtures/${fixture}.json`)).json();
    const rotation = params.get('rotation') || 0;
    const theta = rotation * Math.PI / 180;
    const round = rotation % 90 === 0 ? Math.round : x => x;
    const xx = round(Math.cos(theta));
    const xy = round(-Math.sin(theta));
    const yx = round(Math.sin(theta));
    const yy = round(Math.cos(theta));
    for (const ring of testPoints) {
        for (const coord of ring) {
            const [x, y] = coord;
            coord[0] = xx * x + xy * y;
            coord[1] = yx * x + yy * y;
        }
    }

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

    for (let i = 0; i < testPoints[0].length; i++) {
        minX = Math.min(minX, testPoints[0][i][0]);
        maxX = Math.max(maxX, testPoints[0][i][0]);
        minY = Math.min(minY, testPoints[0][i][1]);
        maxY = Math.max(maxY, testPoints[0][i][1]);
    }

    const width = maxX - minX;
    const height = maxY - minY;

    canvas.width = window.innerWidth;
    canvas.height = canvas.width * height / width + 10;

    const ratio = (canvas.width - 10) / width;

    if (devicePixelRatio > 1) {
        canvas.style.width = `${canvas.width}px`;
        canvas.style.height = `${canvas.height}px`;
        canvas.width *= 2;
        canvas.height *= 2;
        ctx.scale(2, 2);
    }

    const data = flatten(testPoints);

    console.time('earcut');
    const result = earcut(data.vertices, data.holes, data.dimensions);
    console.timeEnd('earcut');

    console.log(`deviation: ${deviation(data.vertices, data.holes, data.dimensions, result)}`);

    const triangles = [];
    for (const index of result) {
        triangles.push([data.vertices[index * data.dimensions], data.vertices[index * data.dimensions + 1]]);
    }

    ctx.lineJoin = 'round';

    for (let i = 0; i < triangles.length; i += 3) {
        drawPoly(triangles.slice(i, i + 3), 'rgba(255,0,0,0.2)', 'rgba(255,255,0,0.2)');
        // drawPoly(triangles.slice(i, i + 3), 'rgba(255,0,0,0.0)', 'rgba(255,0,0,0.3)');
    }

    drawPoly(testPoints, 'black', true);

    function drawPoint(p, color) {
        const x = (p[0] - minX) * ratio + 5,
            y = (p[1] - minY) * ratio + 5;
        ctx.fillStyle = color || 'grey';
        ctx.fillRect(x - 3, y - 3, 6, 6);
    }

    function drawPoly(rings, color, fill) {
        ctx.beginPath();

        ctx.strokeStyle = color;
        if (fill && fill !== true) ctx.fillStyle = fill;

        if (typeof rings[0][0] === 'number') rings = [rings];

        for (const points of rings) {
            for (let i = 0; i < points.length; i++) {
                const x = (points[i][0] - minX) * ratio + 5,
                    y = (points[i][1] - minY) * ratio + 5;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            if (fill) ctx.closePath();
        }
        ctx.stroke();

        if (fill && fill !== true) ctx.fill('evenodd');
    }

    function clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function drawNode(node, color) {
        drawPoint([node.x, node.y], color);
    }

    function drawNodeRing(node, color, fill) {
        const start = node;
        const points = [];
        do {
            points.push([node.x, node.y]);
            node = node.next;
        } while (node !== start);

        console.log(JSON.stringify(points));
        drawPoly(points, color, fill);
    }

    function drawNodePolygon(node) {
        drawNodeRing(node, 'black', 'rgba(255,255,0,0.2)');
    }

    function drawNodeEdge(node, color) {
        drawPoly([[node.x, node.y], [node.next.x, node.next.y]], color);
    }
})();
