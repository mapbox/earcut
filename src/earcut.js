'use strict';

module.exports = earcut;

function earcut(data) {

    var outerNode = linkedList(data, true),
        triangles = [];

    if (!outerNode) return triangles;

    earcutLinked(outerNode, triangles, data);

    return triangles;
}

// create a circular doubly linked list from polygon points in the specified winding order
function linkedList(data, clockwise) {
    var sum = 0,
        len = data.length,
        i, j, last;

    // calculate original winding order of a polygon ring
    for (i = 0, j = len - 2; i < len; i += 2) {
        sum += (data[i] - data[j]) * (data[i + 1] + data[j + 1]);
        j = i;
    }

    // link points into circular doubly-linked list in the specified winding order
    if (clockwise !== (sum > 0)) {
        for (i = 0; i < len; i += 2) last = insertNode(i, last);
    } else {
        for (i = len - 2; i >= 0; i -= 2) last = insertNode(i, last);
    }

    return last;
}

// main ear slicing loop which triangulates a polygon (given as a linked list)
function earcutLinked(ear, triangles, data) {

    var stop = ear,
        prev, next;

    // iterate through ears, slicing them one by one
    while (ear.prev !== ear.next) {
        prev = ear.prev;
        next = ear.next;

        if (isEar(ear, data)) {
            // cut off the triangle
            triangles.push(prev.i);
            triangles.push(ear.i);
            triangles.push(next.i);

            // remove ear node
            next.prev = prev;
            prev.next = next;

            // skipping the next vertice leads to less sliver triangles
            ear = next.next;
            stop = next.next;

            continue;
        }

        ear = next;

        // if we looped through the whole remaining polygon and can't find any more ears
        if (ear === stop) {
            break;
        }
    }
}

// check whether a polygon node forms a valid ear with adjacent nodes
function isEar(ear, data) {

    var a = ear.prev.i,
        b = ear.i,
        c = ear.next.i,

        ax = data[a], bx = data[b], cx = data[c],
        ay = data[a + 1], by = data[b + 1], cy = data[c + 1],

        abd = ax * by - ay * bx,
        acd = ax * cy - ay * cx,
        cbd = cx * by - cy * bx,
        A = abd - acd - cbd;

    if (A <= 0) return false; // reflex, can't be an ear

    // now make sure we don't have other points inside the potential ear;
    // the code below is a bit verbose and repetitive but this is done for performance

    var cay = cy - ay,
        acx = ax - cx,
        aby = ay - by,
        bax = bx - ax,
        p, px, py, s, t, k, node;

    node = ear.next.next;

    while (node !== ear.prev) {
        p = node.i;
        node = node.next;

        px = data[p];
        py = data[p + 1];

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

// create a node and optionally link it with previous one (in a circular doubly linked list)
function insertNode(i, last) {
    var node = new Node(i);

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

function Node(i) {
    // vertex coordinates
    this.i = i;

    // previous and next vertice nodes in a polygon ring
    this.prev = null;
    this.next = null;
}
