'use strict';

module.exports = earcut;

function earcut(points) {

    var outerNode = linkedList(points[0], true);

    if (points.length > 1) outerNode = eliminateHoles(points, outerNode);

    var triangles = [];
    if (outerNode) earcutLinked(outerNode, triangles);

    return triangles;
}

function indexCurve(start) {
    var node = start,
        curve = [],
        minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity,
        x, y;

    do {
        x = node.p[0];
        y = node.p[1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        node = node.next;
    } while (node !== start);

    do {
        x = node.zx = Math.floor(1000 * (node.p[0] - minX) / (maxX - minX));
        y = node.zy = Math.floor(1000 * (node.p[1] - minY) / (maxY - minY));
        node.z = zOrder(x, y);
        curve.push(node);

        node = node.next;
    } while (node !== start);

    curve.sort(compareZ);

    curve[0].prevZ = null;
    for (var i = 0; i < curve.length - 1; i++) {
        curve[i].nextZ = curve[i + 1];
        curve[i + 1].prevZ = curve[i];
    }
    curve[curve.length - 1].nextZ = null;
}

function zOrder(x, y) {
    x = (x | (x << 8)) & 0x00FF00FF;
    x = (x | (x << 4)) & 0x0F0F0F0F;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;

    y = (y | (y << 8)) & 0x00FF00FF;
    y = (y | (y << 4)) & 0x0F0F0F0F;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;

    return x | (y << 1);
}

// create a circular doubly linked list from polygon points in the specified winding order
function linkedList(points, clockwise) {
    var sum = 0,
        len = points.length,
        i, j, last;

    // calculate original winding order of a polygon ring
    for (i = 0, j = len - 1; i < len; j = i++) {
        var p1 = points[i],
            p2 = points[j];
        sum += (p2[0] - p1[0]) * (p1[1] + p2[1]);
    }

    // link points into circular doubly-linked list in the specified winding order
    if (clockwise === (sum > 0)) {
        for (i = 0; i < len; i++) last = insertNode(points[i], last);
    } else {
        for (i = len - 1; i >= 0; i--) last = insertNode(points[i], last);
    }

    return last;
}

function filterPoints(start) {
    // eliminate colinear or duplicate points
    var node = start,
        again;
    do {
        again = false;
        if (equals(node.p, node.next.p) || orient(node.prev.p, node.p, node.next.p) === 0) {
            node.prev.next = node.next;
            node.next.prev = node.prev;
            node = start = node.prev;
            if (node === node.next) return null;
            again = true;

        } else {
            node = node.next;
        }
    } while (again || node !== start);

    return start;
}

function earcutLinked(ear, triangles, secondPass) {
    ear = filterPoints(ear);
    if (!ear) return;

    if (!secondPass) indexCurve(ear);

    var stop = ear,
        prev, next;

    // iterate through ears, slicing them one by one
    while (ear.prev !== ear.next) {
        prev = ear.prev;
        next = ear.next;

        if (isEar(ear)) {
            triangles.push(prev.p, ear.p, next.p);

            next.prev = prev;
            prev.next = next;

            ear = next.next;
            stop = next.next;

            continue;
        }

        ear = next;

        if (ear === stop) {
            // if we can't find any more ears, try filtering points and cutting again
            if (!secondPass) earcutLinked(ear, triangles, true);
            // if this didn't work, try splitting the remaining polygon into two
            else splitEarcut(ear, triangles);
            break;
        }
    }
}

var count = 0;

function isEar(ear) {

    var a = ear.prev.p,
        b = ear.p,
        c = ear.next.p,

        ax = a[0], bx = b[0], cx = c[0],
        ay = a[1], by = b[1], cy = c[1],

        azx = ear.prev.zx, bzx = ear.zx, czx = ear.next.zx,
        azy = ear.prev.zy, bzy = ear.zy, czy = ear.next.zy,

        abd = ax * by - ay * bx,
        acd = ax * cy - ay * cx,
        cbd = cx * by - cy * bx,
        A = abd - acd - cbd;

    // drawPoly([[a, b, c]], 'red');

    if (A <= 0) return false; // reflex, can't be an ear

    var node = ear.nextZ,
        cay = cy - ay,
        acx = ax - cx,
        aby = ay - by,
        bax = bx - ax,
        minX = azx < bzx ? (azx < czx ? azx : czx) : (bzx < czx ? bzx : czx),
        minY = azy < bzy ? (azy < czy ? azy : czy) : (bzy < czy ? bzy : czy),
        maxX = azx > bzx ? (azx > czx ? azx : czx) : (bzx > czx ? bzx : czx),
        maxY = azy > bzy ? (azy > czy ? azy : czy) : (bzy > czy ? bzy : czy),
        minZ = zOrder(minX, minY),
        maxZ = zOrder(maxX, maxY),
        p, px, py, s, t, k;

    // make sure we don't have other points inside the potential ear
    while (node && node.z <= maxZ) {

        p = node.p;
        px = node.p[0];
        py = node.p[1];

        node = node.nextZ;

        if (p === a || p === c) continue;

        count++;

        s = cay * px + acx * py - acd;
        if (s >= 0) {
            t = aby * px + bax * py + abd;
            if (t >= 0) {
                k = A - s - t;
                if ((k >= 0) && ((s && t) || (s && k) || (t && k))) return false;
            }
        }
    }

    node = ear.prevZ;

    while (node && node.z >= minZ) {

        p = node.p;
        px = node.p[0];
        py = node.p[1];

        node = node.prevZ;

        if (p === a || p === c) continue;

        count++;

        s = cay * px + acx * py - acd;
        if (s >= 0) {
            t = aby * px + bax * py + abd;
            if (t >= 0) {
                k = A - s - t;
                if ((k >= 0) && ((s && t) || (s && k) || (t && k))) return false;
            }
        }
    }

    return true;
}

function splitEarcut(start, triangles) {
    // find a valid diagonal that divides the polygon into two
    var a = start;
    do {
        var b = a.next.next;
        while (b !== a.prev) {
            if (isValidDiagonal(a, b)) {
                // split the polygon in two by the diagonal
                var c = splitPolygon(a, b);

                // run earcut on each half
                earcutLinked(a, triangles, false);
                earcutLinked(c, triangles, false);
                return;
            }
            b = b.next;
        }
        a = a.next;
    } while (a !== start);
}

function eliminateHoles(points, outerNode) {
    var len = points.length;

    var queue = [];
    for (var i = 1; i < len; i++) {
        var list = filterPoints(linkedList(points[i], false));
        if (list) queue.push(getLeftmost(list));
    }
    queue.sort(compareX);

    // process holes from left to right
    for (i = 0; i < queue.length; i++) {
        eliminateHole(queue[i], outerNode);
        outerNode = filterPoints(outerNode);
    }

    return outerNode;
}

function eliminateHole(holeNode, outerNode) {
    outerNode = findHoleBridge(holeNode, outerNode);
    if (outerNode) splitPolygon(holeNode, outerNode);
}

function findHoleBridge(holeNode, outerNode) {
    var node = outerNode,
        p = holeNode.p,
        px = p[0],
        py = p[1],
        qMax = -Infinity,
        mNode, a, b;

    do {
        a = node.p;
        b = node.next.p;

        if (py <= a[1] && py >= b[1]) {
            var qx = a[0] + (py - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
            if (qx <= px && qx > qMax) {
                qMax = qx;
                mNode = a[0] < b[0] ? node : node.next;
            }
        }
        node = node.next;
    } while (node !== outerNode);

    if (!mNode) return null;

    var bx = mNode.p[0],
        by = mNode.p[1],
        pbd = px * by - py * bx,
        pcd = px * py - py * qMax,
        cpy = py - py,
        pcx = px - qMax,
        pby = py - by,
        bpx = bx - px,
        A = pbd - pcd - (qMax * by - py * bx),
        sign = A <= 0 ? -1 : 1,
        stop = mNode,
        tanMin = Infinity,
        mx, my, amx, s, t, tan;

    node = mNode.next;

    while (node !== stop) {

        mx = node.p[0];
        my = node.p[1];
        amx = px - mx;

        if (amx >= 0 && mx >= bx) {
            s = (cpy * mx + pcx * my - pcd) * sign;
            if (s >= 0) {
                t = (pby * mx + bpx * my + pbd) * sign;

                if (t >= 0 && A * sign - s - t >= 0) {
                    tan = Math.abs(py - my) / amx; // tangential
                    if (tan < tanMin && locallyInside(node, holeNode)) {
                        mNode = node;
                        tanMin = tan;
                    }
                }
            }
        }

        node = node.next;
    }

    return mNode;
}

function getLeftmost(start) {
    var node = start,
        leftmost = start;
    do {
        if (node.p[0] < leftmost.p[0]) leftmost = node;
        node = node.next;
    } while (node !== start);

    return leftmost;
}

function isValidDiagonal(a, b) {
    return !intersectsPolygon(a, a.p, b.p) &&
           locallyInside(a, b) && locallyInside(b, a) &&
           middleInside(a, a.p, b.p);
}

// winding order of triangle formed by 3 given points
function orient(p, q, r) {
    var o = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
    return o > 0 ? 1 :
           o < 0 ? -1 : 0;
}

function equals(p1, p2) {
    return p1[0] === p2[0] && p1[1] === p2[1];
}

// check if two segments intersect
function intersects(p1, q1, p2, q2) {
    return orient(p1, q1, p2) !== orient(p1, q1, q2) &&
           orient(p2, q2, p1) !== orient(p2, q2, q1);
}

// check if a polygon diagonal intersects any polygon segments
function intersectsPolygon(start, a, b) {
    var node = start;
    do {
        var p1 = node.p,
            p2 = node.next.p;

        if (p1 !== a && p2 !== a && p1 !== b && p2 !== b && intersects(p1, p2, a, b)) return true;

        node = node.next;
    } while (node !== start);

    return false;
}

// check if a polygon diagonal is locally inside the polygon
function locallyInside(a, b) {
    return orient(a.prev.p, a.p, a.next.p) === -1 ?
        orient(a.p, b.p, a.next.p) !== -1 && orient(a.p, a.prev.p, b.p) !== -1 :
        orient(a.p, b.p, a.prev.p) === -1 || orient(a.p, a.next.p, b.p) === -1;
}

// check if the middle point of a polygon diagonal is inside the polygon
function middleInside(start, a, b) {
    var node = start,
        inside = false,
        px = (a[0] + b[0]) / 2,
        py = (a[1] + b[1]) / 2;
    do {
        var p1 = node.p,
            p2 = node.next.p;

        if (((p1[1] > py) !== (p2[1] > py)) &&
            (px < (p2[0] - p1[0]) * (py - p1[1]) / (p2[1] - p1[1]) + p1[0])) inside = !inside;

        node = node.next;
    } while (node !== start);

    return inside;
}

function compareX(a, b) {
    return a.p[0] - b.p[0];
}

function compareZ(a, b) {
    return a.z - b.z;
}

// split the polygon vertices circular doubly-linked linked list into two
function splitPolygon(a, b) {
    var a2 = new Node(a.p),
        b2 = new Node(b.p),
        an = a.next,
        bp = b.prev;

    a.next = b;
    b.prev = a;

    a2.next = an;
    an.prev = a2;

    b2.next = a2;
    a2.prev = b2;

    bp.next = b2;
    b2.prev = bp;

    return a2;
}

function insertNode(point, last) {
    var node = new Node(point);

    if (!last) {
        node.prev = node;
        node.next = node;

    } else {
        node.next = last.next;
        node.prev = last;
        last.next.prev = node;
        last.next = node;
    }
    return node;
}

function Node(p) {
    this.p = p;
    this.prev = null;
    this.next = null;

    this.z = null;
    this.zx = null;
    this.zy = null;
    this.prevZ = null;
    this.nextZ = null;
}
