
// module.exports = earcut;

function PolygonNode(data, related, status) {
    this.data = data;

    this.related = related;
    if (related) {
        related.related = this;
        related.status = status;
    }

    this.status = null;

    this.prev = null;
    this.next = null;
}

function Polygon() {
    this.last = null;
}

Polygon.prototype = {
    insert: function (node) {
        if (!this.last) {
            node.prev = node;
            node.next = node;
        } else {
            var last = this.last;
            node.next = last.next;
            node.prev = last;
            last.next.prev = node;
            last.next = node;
        }
        this.last = node;
    },

    remove: function (node) {
        if (node.next === node) this.last = null;
        else {
            node.next.prev = node.prev;
            node.prev.next = node.next;
            if (node === this.last) this.last = node.prev;
        }
    }
};

function windPart(p1, p2) {
    return (p2[0] - p1[0]) * (p2[1] + p1[1]);
}

function earcut(points) {

    var contour = new Polygon(),
        convex = new Polygon(),
        ears = new Polygon(),
        reflex = new Polygon();

    var sum = 0;

    // create a doubly linked list from polygon points
    for (var i = 0; i < points.length; i++) {
        var node = new PolygonNode(points[i]);
        contour.insert(node);

        var j = i ? i - 1 : points.length - 1;
        sum += windPart(points[j], points[i]);

    }

    var clockwise = sum < 0;

    // create 2 doubly linked lists, one containing convex vertices and other containing reflex vertices
    var node = contour.last;
    do {
        if (isConvex(node, clockwise)) convex.insert(new PolygonNode(null, node, 2));
        else reflex.insert(new PolygonNode(null, node, 1));

        node = node.next;
    } while (node !== contour.last);

    // create a dooubly linked list of ears
    var node = convex.last;
    do {
        if (isEar(node.related, reflex)) ears.insert(new PolygonNode(null, node.related, 3));
        node = node.next;
    } while (node !== convex.last);

    var triangles = [];

    // iterate through ears, slicing them one by one
    var ear = ears.last;
    do {
        var node = ear.related,
            prev = node.prev,
            next = node.next;

        triangles.push([prev.data, node.data, next.data]);

        ears.remove(ear);
        contour.remove(node);

        reclassifyEar(prev, reflex, ears, clockwise);
        reclassifyEar(next, reflex, ears, clockwise);

        ear = ears.last;
    } while (ears.last);

    return triangles;
}

function reclassifyEar(node, reflex, ears, clockwise) {

    if (node.status === 1) { // reflex
        if (isConvex(node, clockwise)) {
            reflex.remove(node.related); // angle was reflex and became convex
            node.status = 2;

        } else return; // angle remained reflex, no ear status change
    }

    var earNow = isEar(node, reflex);

    if (node.status === 2) { // convex
        if (earNow) { // became ear
            node.status = 3;
            ears.insert(node.related);
        }
    } else { // ear
        if (!earNow) { // stopped being ear, just convex
            node.status = 2;
            ears.remove(node.related);
        }
    }
}

function isConvex(node, clockwise) {
    return clockwise === (cross(node.next.data, node.prev.data, node.data) >= 0);
}

function cross(p, a, b) {
    var ax = a[0] - p[0],
        ay = a[1] - p[1],
        bx = b[0] - p[0],
        by = b[1] - p[1];
    return ax * by - ay * bx;
}

function isEar(node, reflex) {
    // iterate through points to check if there's a reflex point inside a potential ear
    var node2 = reflex.last,
        rel;
    if (!node2) return true;
    do {
        rel = node2.related;
        if (node.prev !== rel && node.next !== rel &&
                inside(rel.data, node.prev.data, node.data, node.next.data)) return false;
        node2 = node2.next;
    } while (node2 !== reflex.last);

    return true;
}


function inside(p, a, b, c) {
    var A = -b[1] * c[0] + a[1] * (-b[0] + c[0]) + a[0] * (b[1] - c[1]) + b[0] * c[1],
        sign = A < 0 ? -1 : 1,
        s = (a[1] * c[0] - a[0] * c[1] + (c[1] - a[1]) * p[0] + (a[0] - c[0]) * p[1]) * sign,
        t = (a[0] * b[1] - a[1] * b[0] + (a[1] - b[1]) * p[0] + (b[0] - a[0]) * p[1]) * sign;

    return s >= 0 && t >= 0 && (s + t) <= A * sign;
}
