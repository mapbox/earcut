'use strict';

if (typeof module !== 'undefined') module.exports = earcut;

function earcut(points) {

    var outerNode = filterPoints(linkedList(points[0], true));

    if (points.length > 1) eliminateHoles(points, outerNode);

    var triangles = [];
    earcutLinked(outerNode, triangles);

    return triangles;
}

// create a circular doubly linked list from polygon points in the specified winding order
function linkedList(points, ccw) {
    var sum = 0,
        len = points.length,
        i, j, last, leftmost;

    // calculate original winding order of a polygon ring
    for (i = 0, j = len - 1; i < len; j = i++) {
        sum += (points[i][0] - points[j][0]) * (points[i][1] + points[j][1]);
    }

    // link points into circular doubly-linked list in the specified winding order; return the leftmost point
    if (ccw === (sum < 0)) {
        for (i = 0; i < len; i++) {
            last = insertNode(points[i], last);
            if (!ccw && (!leftmost || last.p[0] < leftmost.p[0])) leftmost = last;
        }
    } else {
        for (i = len - 1; i >= 0; i--) {
            last = insertNode(points[i], last);
            if (!ccw && (!leftmost || last.p[0] < leftmost.p[0])) leftmost = last;
        }
    }

    return leftmost || last;
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
            again = true;

        } else {
            node = node.next;
        }
    } while (again || node !== start);

    return start;
}

function earcutLinked(ear, triangles) {
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
            stop = next.next;
            ear = next;
        }
        ear = ear.next;

        if (ear.next === stop) {
            // if we can't find valid ears anymore, split remaining polygon into two
            splitEarcut(ear, triangles);
            break;
        }
    }
}

// iterate through points to check if there's a reflex point inside a potential ear
function isEar(ear) {

    var a = ear.prev.p,
        b = ear.p,
        c = ear.next.p,

        ax = a[0], bx = b[0], cx = c[0],
        ay = a[1], by = b[1], cy = c[1],

        abd = ax * by - ay * bx,
        acd = ax * cy - ay * cx,
        cbd = cx * by - cy * bx,
        A = abd - acd - cbd;

    if (A <= 0) return false; // reflex

    var node = ear.next.next,
        cay = cy - ay,
        acx = ax - cx,
        aby = ay - by,
        bax = bx - ax,
        px, py, s, t;

    while (node !== ear.prev) {

        px = node.p[0];
        py = node.p[1];

        s = cay * px + acx * py - acd;
        if (s > 0) {
            t = aby * px + bax * py + abd;
            if (t > 0 && s + t < A) return false;
        }
        node = node.next;
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
                earcutLinked(a, triangles);
                earcutLinked(c, triangles);
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
        queue.push(filterPoints(linkedList(points[i], false)));
    }
    queue.sort(compareX);

    // process holes from left to right
    for (i = 0; i < len - 1; i++) {
        eliminateHole(outerNode, queue[i]);
    }
}

function eliminateHole(outerNode, holeNode) {
    var queue = [];

    var node = outerNode;
    do {
        if (node.p[0] <= holeNode.p[0]) queue.push({node: node, dist: sqrDist(node.p, holeNode.p)});
        node = node.next;
    } while (node !== outerNode);

    queue.sort(compareDist);

    for (var i = 0; i < queue.length; i++) {
        node = queue[i].node;

        if (!intersectsPolygon(node, node.p, holeNode.p)) {
            splitPolygon(holeNode, node);
            return;
        }
    }
}

function isValidDiagonal(a, b) {
    return !intersectsPolygon(a, a.p, b.p) &&
           locallyInside(a, b) && locallyInside(b, a) && middleInside(a, a.p, b.p);
}

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

        if (((p1[1] > py) !== (p2[1] > py)) && (px < (p2[0] - p1[0]) * (py - p1[1]) / (p2[1] - p1[1]) + p1[0])) {
            inside = !inside;
        }
        node = node.next;
    } while (node !== start);

    return inside;
}

function sqrDist(a, b) {
    var dx = a[0] - b[0],
        dy = a[1] - b[1];
    return dx * dx + dy * dy;
}

function compareDist(a, b) {
    return a.dist - b.dist;
}

function compareX(a, b) {
    return a.p[0] - b.p[0];
}

// split the polygon vertices circular doubly-linked linked list into two
function splitPolygon(a, b) {
    var a2 = {p: a.p, prev: null, next: null},
        b2 = {p: b.p, prev: null, next: null},
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
    var node = {
        p: point,
        prev: null,
        next: null
    };

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
