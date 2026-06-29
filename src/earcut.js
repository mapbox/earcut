/**
 * A vertex in a circular doubly linked list representing a polygon ring.
 * `prev`/`next` are always linked (set immediately after {@link createNode}), so they're typed
 * non-null; `prevZ`/`nextZ` are the z-order list links and are null at the ends.
 *
 * @typedef {object} Node
 * @property {number} i vertex index in the coordinates array
 * @property {number} x vertex x coordinate
 * @property {number} y vertex y coordinate
 * @property {Node} prev previous vertex node in the polygon ring
 * @property {Node} next next vertex node in the polygon ring
 * @property {number} z z-order curve value; doubles as the owning block index during eliminateHoles
 * @property {Node | null} prevZ previous node in z-order
 * @property {Node | null} nextZ next node in z-order
 */

// single-vertex holes to preserve through filterPoints (steiner points); kept off the Node
// shape since they're rare — the empty-set fast path means non-steiner inputs pay nothing
/** @type {Set<Node>} */
const steiners = new Set();

// set by filterPoints whenever it removes at least one node; read by earcutLinked's stall
// handler to decide whether another clip pass is worth attempting before the costlier stages
let filteredOut = false;

/**
 * Triangulate a polygon given as a flat array of vertex coordinates.
 *
 * @param {ArrayLike<number>} data flat array of vertex coordinates
 * @param {ArrayLike<number> | null} [holeIndices] indices (in vertices, not coordinates) where each hole ring starts
 * @param {number} [dim=2] number of coordinates per vertex in `data`
 * @returns {number[]} triangles as triplets of vertex indices into `data`
 * @example earcut([10,0, 0,50, 60,60, 70,10]); // [1,0,3, 3,2,1]
 */
export default function earcut(data, holeIndices, dim = 2) {

    const hasHoles = holeIndices && holeIndices.length;
    const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
    if (steiners.size) steiners.clear();

    let outerNode = linkedList(data, 0, outerLen, dim, true);
    /** @type {number[]} */
    const triangles = [];

    if (!outerNode || outerNode.next === outerNode.prev) return triangles;

    let minX = 0, minY = 0, invSize = 0;

    if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);

    // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
    if (data.length > 80 * dim) {
        minX = data[0];
        minY = data[1];
        let maxX = minX;
        let maxY = minY;

        for (let i = dim; i < outerLen; i += dim) {
            const x = data[i];
            const y = data[i + 1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        // minX, minY and invSize are later used to transform coords into integers for z-order calculation
        invSize = Math.max(maxX - minX, maxY - minY);
        invSize = invSize !== 0 ? 32767 / invSize : 0;
    }

    earcutLinked(outerNode, triangles, minX, minY, invSize);

    return triangles;
}

// create a circular doubly linked list from polygon points in the specified winding order
/** @param {ArrayLike<number>} data @param {number} start @param {number} end @param {number} dim @param {boolean} clockwise @returns {Node | null} */
function linkedList(data, start, end, dim, clockwise) {
    /** @type {Node | null} */
    let last = null;

    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
        for (let i = start; i < end; i += dim) last = insertNode(i / dim | 0, data[i], data[i + 1], last);
    } else {
        for (let i = end - dim; i >= start; i -= dim) last = insertNode(i / dim | 0, data[i], data[i + 1], last);
    }

    if (last && equals(last, last.next)) {
        removeNode(last);
        last = last.next;
    }

    return last;
}

// Remove collinear or coincident points; removability depends only on a node's immediate
// neighbors, so we sweep forward and re-check the predecessor after each removal. With no `end`
// we sweep the whole ring, lapping until nothing is removable (the fixpoint the clipper needs).
// With an explicit `end` we heal only the dirty window around a bridge/diagonal cut, stopping at
// `end` rather than lapping — O(window) instead of O(ring).
/** @param {Node} start @param {Node} [end] @returns {Node} */
function filterPoints(start, end = start) {
    const full = end === start;

    let p = start, again;
    do {
        again = false;
        if (p !== p.next && (steiners.size === 0 || !steiners.has(p)) &&
            (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
            if (full || p === end) end = p.prev; // pull the stop bound back past the removal
            filteredOut = true;
            removeNode(p);
            p = p.prev;         // re-check the predecessor
            again = true;
        } else if (full || p !== end) {
            p = p.next;
            again = !full;      // local heal: keep looping until the sweep reaches end
        }
    } while (again || p !== end);

    return end;
}

// main ear slicing loop which triangulates a polygon (given as a linked list)
/** @param {Node} ear @param {number[]} triangles @param {number} minX @param {number} minY @param {number} invSize */
function earcutLinked(ear, triangles, minX, minY, invSize) {
    // interlink polygon nodes in z-order
    if (invSize) indexCurve(ear, minX, minY, invSize);

    let stop = ear, cured = false;

    // iterate through ears, slicing them one by one
    while (ear.prev !== ear.next) {
        const prev = ear.prev;
        /** @type {Node} */
        const next = ear.next;

        if (area(prev, ear, next) < 0 && (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear))) {
            triangles.push(prev.i, ear.i, next.i); // cut off the triangle

            removeNode(ear);
            ear = next;
            stop = next;
            continue;
        }

        ear = next;

        // if we looped through the whole remaining polygon and can't find any more ears
        if (ear === stop) {
            // try filtering collinear/coincident points and slicing again — repeat as long as
            // filtering actually removes nodes, since each removal can expose new ears
            filteredOut = false;
            ear = filterPoints(ear);
            if (filteredOut) { stop = ear; continue; }

            // filtering is exhausted: cure small local self-intersections once, then retry
            if (!cured) {
                ear = cureLocalIntersections(ear, triangles);
                stop = ear;
                cured = true;
                continue;
            }

            // as a last resort, try splitting the remaining polygon into two
            splitEarcut(ear, triangles, minX, minY, invSize);
            break;
        }
    }
}

// check whether a polygon node forms a valid ear with adjacent nodes
/** @param {Node} ear @returns {boolean} */
function isEar(ear) {
    // reflex check (area(a, b, c) >= 0) is hoisted into the earcutLinked caller to avoid non-inlined call here
    const a = ear.prev, b = ear, c = ear.next,
        ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y,
        x0 = Math.min(ax, bx, cx), // triangle bbox
        y0 = Math.min(ay, by, cy),
        x1 = Math.max(ax, bx, cx),
        y1 = Math.max(ay, by, cy);

    // make sure we don't have other points inside the potential ear
    let p = c.next;
    while (p !== a) {
        if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && !(ax === p.x && ay === p.y) &&
            pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
        p = p.next;
    }
    return true;
}

/** @param {Node} ear @param {number} minX @param {number} minY @param {number} invSize @returns {boolean} */
function isEarHashed(ear, minX, minY, invSize) {
    // reflex check is hoisted into the earcutLinked caller (see isEar)
    const a = ear.prev, b = ear, c = ear.next,
        ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y,
        x0 = Math.min(ax, bx, cx), // triangle bbox
        y0 = Math.min(ay, by, cy),
        x1 = Math.max(ax, bx, cx),
        y1 = Math.max(ay, by, cy),
        minZ = zOrder(x0, y0, minX, minY, invSize), // z-order range for the current triangle bbox;
        maxZ = zOrder(x1, y1, minX, minY, invSize);

    let p = ear.prevZ;
    while (p && p.z >= minZ) { // look for points inside the triangle in decreasing z-order
        if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== c && !(ax === p.x && ay === p.y) &&
            pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
        p = p.prevZ;
    }
    let n = ear.nextZ;
    while (n && n.z <= maxZ) { // look for points in increasing z-order
        if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== c && !(ax === n.x && ay === n.y) &&
            pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
        n = n.nextZ;
    }
    return true;
}

// go through all polygon nodes and cure small local self-intersections
/** @param {Node} start @param {number[]} triangles @returns {Node} */
function cureLocalIntersections(start, triangles) {
    let p = start;
    let cured = false;
    do {
        const a = p.prev,
            b = p.next.next;

        if (intersects(a, p, p.next, b, false) && locallyInside(a, b) && locallyInside(b, a)) {

            triangles.push(a.i, p.i, b.i);

            // remove two nodes involved
            removeNode(p);
            removeNode(p.next);

            p = start = b;
            cured = true;
        }
        p = p.next;
    } while (p !== start);

    return cured ? filterPoints(p) : p;
}

// try splitting polygon into two and triangulate them independently
/** @param {Node} start @param {number[]} triangles @param {number} minX @param {number} minY @param {number} invSize */
function splitEarcut(start, triangles, minX, minY, invSize) {
    // look for a valid diagonal that divides the polygon into two
    let a = start;
    do {
        let b = a.next.next;
        while (b !== a.prev) {
            if (a.i !== b.i && isValidDiagonal(a, b)) {
                // split the polygon in two by the diagonal
                let c = splitPolygon(a, b);

                // filter colinear points around the cuts
                a = filterPoints(a, a.next);
                c = filterPoints(c, c.next);

                // run earcut on each half
                earcutLinked(a, triangles, minX, minY, invSize);
                earcutLinked(c, triangles, minX, minY, invSize);
                return;
            }
            b = b.next;
        }
        a = a.next;
    } while (a !== start);
}

// true only while eliminateHoles merges holes, so removeNode keeps the block index live (growBlock)
let indexActive = false;

// link every hole into the outer loop, producing a single-ring polygon without holes
/** @param {ArrayLike<number>} data @param {ArrayLike<number>} holeIndices @param {Node} outerNode @param {number} dim @returns {Node} */
function eliminateHoles(data, holeIndices, outerNode, dim) {
    const queue = [];

    for (let i = 0, len = holeIndices.length; i < len; i++) {
        const start = holeIndices[i] * dim;
        const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
        const list = /** @type {Node} */ (linkedList(data, start, end, dim, false));
        if (list === list.next) steiners.add(list);
        queue.push(getLeftmost(list));
    }

    queue.sort(compareXYSlope);

    // block-bbox index for findHoleBridge, grown append-only as holes merge (see notes
    // above buildBlockIndex). Seed it with the outer ring, then append each merged hole.
    buildBlockIndex(data.length / dim, holeIndices.length);
    indexSegment(outerNode, outerNode);

    // process holes from left to right; indexActive lets removeNode keep block bboxes live as
    // filterPoints heals edges during merges (see growBlock)
    indexActive = true;
    for (let i = 0; i < queue.length; i++) {
        outerNode = eliminateHole(queue[i], outerNode);
    }
    indexActive = false;

    // collapse collinear/coincident points across the whole merged ring once before clipping
    return filterPoints(outerNode);
}

/** @param {Node} a @param {Node} b @returns {number} */
function compareXYSlope(a, b) {
    // when the left-most point of 2 holes meet at a vertex, sort the holes counterclockwise so that when we find
    // the bridge to the outer shell is always the point that they meet at.
    return a.x - b.x || a.y - b.y ||
        (a.next.y - a.y) / (a.next.x - a.x) -
        (b.next.y - b.y) / (b.next.x - b.x);
}

// find a bridge between vertices that connects hole with an outer ring and link it
/** @param {Node} hole @param {Node} outerNode @returns {Node} */
function eliminateHole(hole, outerNode) {
    const bridge = findHoleBridge(hole, outerNode);
    if (!bridge) {
        return outerNode;
    }

    const bridgeReverse = splitPolygon(bridge, hole);

    // index the merged-in segment before filtering: in ring order the splice runs
    // bridge -> hole -> bridgeReverse -> bridge2 -> (bridge's old next), covering the
    // hole's edges and both new slit edges. filterPoints below only drops collinear /
    // coincident points, so these bboxes stay valid (conservative) supersets.
    const bridge2 = bridgeReverse.next;
    indexSegment(bridge, bridge2.next);

    // heal collinear/coincident points around the two new slit edges
    filterPoints(bridgeReverse, bridgeReverse.next);
    return filterPoints(bridge, bridge.next);
}

// Block-bbox index for findHoleBridge (issue #183): one [minX,minY,maxX,maxY] bbox per K
// consecutive ring edges, in a flat Float64Array, so the leftward-ray scan can skip whole
// blocks in O(1) instead of walking the entire merged ring. Grown append-only — the outer
// ring seeds it, then each merged hole appends a segment (head node, stop node, K-blocks
// over head..stop); independent segments, not a ring tiling, since splices land mid-ring.
// Buffers are sized once from the input upper bound and reused across calls.
//
// filterPoints only drops collinear/coincident points, so a stale bbox stays a conservative
// superset of its live edges (never a false skip); the scan skips dead nodes (p.prev.next !==
// p) and lazily advances a dead stop. Blocks are scanned in append (not ring) order, so the
// chosen bridge can differ from the un-indexed code — a different but equally valid result.
const K = 16; // edges per block

let blockBBox = new Float64Array(0); // [minX,minY,maxX,maxY] per block
let numBlocks = 0;
/** @type {Node[]} */
const blockHead = []; // first node of each block's segment
/** @type {Node[]} */
const blockStop = []; // node just past each block's segment (exclusive walk bound)

/** @param {number} maxNodes @param {number} numHoles */
function buildBlockIndex(maxNodes, numHoles) {
    // upper bound: every input node indexed once, +2 bridge nodes per hole, plus a partial
    // trailing block per appended segment (outer ring + one per hole)
    const maxBlocks = Math.ceil((maxNodes + 2 * numHoles) / K) + numHoles + 2;
    if (blockBBox.length < maxBlocks * 4) blockBBox = new Float64Array(maxBlocks * 4);
    numBlocks = 0;
}

// index the ring run head..stop (exclusive) as ceil(len / K) blocks; head === stop means
// the whole ring. each block's bbox covers both endpoints of every edge it owns.
/** @param {Node} head @param {Node} stop */
function indexSegment(head, stop) {
    let p = head;
    do {
        const b = numBlocks++;
        blockHead[b] = p;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let k = 0;
        do {
            const c = p.next; // edge p->c; bbox must bound both endpoints
            p.z = b; // reuse z as the owning block during eliminateHoles (see growBlock)
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
            if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
            p = c;
        } while (++k < K && p !== stop);
        blockStop[b] = p;
        const g = b * 4;
        blockBBox[g] = minX; blockBBox[g + 1] = minY; blockBBox[g + 2] = maxX; blockBBox[g + 3] = maxY;
    } while (p !== stop);
}

// when filterPoints heals an edge head->tail (removing the collinear node between them), the
// healed edge can extend past head's frozen block bbox if its old far endpoint lived in another
// block; grow head's block bbox to cover tail so the leftward-ray prune can't false-skip it.
/** @param {Node} head @param {Node} tail */
function growBlock(head, tail) {
    const g = head.z * 4;
    if (tail.x < blockBBox[g]) blockBBox[g] = tail.x;
    if (tail.y < blockBBox[g + 1]) blockBBox[g + 1] = tail.y;
    if (tail.x > blockBBox[g + 2]) blockBBox[g + 2] = tail.x;
    if (tail.y > blockBBox[g + 3]) blockBBox[g + 3] = tail.y;
}

/** @param {number} b @returns {Node} */
function liveBlockStop(b) {
    let stop = blockStop[b];
    while (stop.prev.next !== stop) stop = stop.next;
    blockStop[b] = stop;
    return stop;
}

// the block's head node can be removed by filterPoints during merges; advance it to the next
// live node so the walk doesn't start on (and immediately terminate at) a dead node. For the
// single full-ring seed block (head === stop) the same forward advance keeps them equal, so the
// do-while still laps the whole ring instead of collapsing to an empty walk.
/** @param {number} b @returns {Node} */
function liveBlockHead(b) {
    let head = blockHead[b];
    while (head.prev.next !== head) head = head.next;
    blockHead[b] = head;
    return head;
}

// David Eberly's algorithm for finding a bridge between hole and outer polygon
/** @param {Node} hole @param {Node} outerNode @returns {Node | null} */
function findHoleBridge(hole, outerNode) {
    let p = outerNode;
    const hx = hole.x;
    const hy = hole.y;
    let qx = -Infinity;
    /** @type {Node | undefined} */
    let m;

    // find a segment intersected by a ray from the hole's leftmost point to the left;
    // segment's endpoint with lesser x will be potential connection point
    // unless they intersect at a vertex, then choose the vertex
    if (equals(hole, p)) return p;

    // scan blocks; skip any whose bbox can't hold a crossing that beats qx and lies left
    // of hx (the prune Morton order can't express — explicit per-axis [minY,maxY]/[minX,maxX])
    for (let b = 0, g = 0; b < numBlocks; b++, g += 4) {
        if (hy < blockBBox[g + 1] || hy > blockBBox[g + 3] || blockBBox[g] > hx || blockBBox[g + 2] <= qx) continue;

        // ensure the walk's exclusive bound is live so we don't overrun into other blocks
        const stop = liveBlockStop(b);

        p = liveBlockHead(b);
        do {
            if (p.prev.next === p) { // skip nodes removed by filterPoints (stale in the index)
                if (equals(hole, p.next)) return p.next;
                else if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
                    const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
                    if (x <= hx && x > qx) {
                        qx = x;
                        m = p.x < p.next.x ? p : p.next;
                        if (x === hx) return m; // hole touches outer segment; pick leftmost endpoint
                    }
                }
            }
            p = p.next;
        } while (p !== stop);
    }

    if (!m) return null;

    // look for points inside the triangle of hole point, segment intersection and endpoint;
    // if there are no points found, we have a valid connection;
    // otherwise choose the point of the minimum angle with the ray as connection point

    const mx = m.x;
    const my = m.y;
    const tminY = Math.min(hy, my); // the triangle's y span; x span is [mx, hx]
    const tmaxY = Math.max(hy, my);
    let tanMin = Infinity;

    // scan the same blocks; skip any whose bbox can't overlap the triangle's [mx,hx]×[tminY,tmaxY] box
    for (let b = 0, g = 0; b < numBlocks; b++, g += 4) {
        if (blockBBox[g + 2] < mx || blockBBox[g] > hx || blockBBox[g + 3] < tminY || blockBBox[g + 1] > tmaxY) continue;

        const stop = liveBlockStop(b);

        p = liveBlockHead(b);
        do {
            if (p.prev.next === p && hx >= p.x && p.x >= mx && hx !== p.x && // skip dead nodes
                    pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {

                const tan = Math.abs(hy - p.y) / (hx - p.x); // tangential

                // if hole point sits on p's horizontal edge (T-junction touch): the bridge runs
                // along that edge — locallyInside rejects it as collinear, but it's valid
                if ((locallyInside(p, hole) || (p.y === hy && p.next.y === hy && p.next.x > hx)) &&
                    (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
                    m = p;
                    tanMin = tan;
                }
            }

            p = p.next;
        } while (p !== stop);
    }

    return m;
}

// whether sector in vertex m contains sector in vertex p in the same coordinates
/** @param {Node} m @param {Node} p @returns {boolean} */
function sectorContainsSector(m, p) {
    return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
}

// scratch buffers reused across calls and grown on demand: two node-ref arrays that
// ping-pong during the radix passes, plus parallel z-value arrays so the passes read
// z from contiguous memory instead of dereferencing each node. 256-entry histogram for
// 8-bit digits; the small histogram keeps per-call setup cheap (most rings are short)
/** @type {Node[]} */
const sortArr = [];
/** @type {Node[]} */
let sortBuf = [];
let zArr = new Uint32Array(0);
let zBuf = new Uint32Array(0);
const counts = new Uint32Array(256);

// interlink polygon nodes in z-order: collect into an array, sort by z, relink
/** @param {Node} start @param {number} minX @param {number} minY @param {number} invSize */
function indexCurve(start, minX, minY, invSize) {
    let p = start;
    let n = 0;
    do {
        // always (re)compute: z may still hold a block index left over from eliminateHoles
        p.z = zOrder(p.x, p.y, minX, minY, invSize);
        sortArr[n++] = p;
        p = p.next;
    } while (p !== start);

    sortNodes(n);

    /** @type {Node | null} */
    let prev = null;
    for (let i = 0; i < n; i++) {
        const node = sortArr[i];
        node.prevZ = prev;
        if (prev) prev.nextZ = node;
        prev = node;
    }
    /** @type {Node} */ (prev).nextZ = null;
}

// sort the first n nodes of sortArr by z, in place: insertion sort for small n (cheaper
// than histogram setup), else LSD radix in four 8-bit passes (covering z's 30 bits)
/** @param {number} n */
function sortNodes(n) {
    if (n <= 32) {
        for (let i = 1; i < n; i++) {
            const node = sortArr[i], z = node.z;
            let j = i - 1;
            while (j >= 0 && sortArr[j].z > z) { sortArr[j + 1] = sortArr[j]; j--; }
            sortArr[j + 1] = node;
        }
        return;
    }

    if (zArr.length < n) {
        zArr = new Uint32Array(n);
        zBuf = new Uint32Array(n);
        sortBuf = new Array(n);
    }
    for (let i = 0; i < n; i++) zArr[i] = sortArr[i].z;

    // even pass count lands the sorted result back in sortArr
    radixPass(n, sortArr, zArr, sortBuf, zBuf, 0);
    radixPass(n, sortBuf, zBuf, sortArr, zArr, 8);
    radixPass(n, sortArr, zArr, sortBuf, zBuf, 16);
    radixPass(n, sortBuf, zBuf, sortArr, zArr, 24);
}

// one LSD radix pass: stably scatter the first n nodes (and their z) from src to dst,
// bucketed by the 8-bit digit of z at the given bit shift
/** @param {number} n @param {Node[]} src @param {Uint32Array} srcZ @param {Node[]} dst @param {Uint32Array} dstZ @param {number} shift */
function radixPass(n, src, srcZ, dst, dstZ, shift) {
    counts.fill(0);
    for (let i = 0; i < n; i++) counts[(srcZ[i] >>> shift) & 0xff]++;
    // turn per-bucket counts into start offsets (prefix sum)
    let sum = 0;
    for (let b = 0; b < 256; b++) { const c = counts[b]; counts[b] = sum; sum += c; }
    for (let i = 0; i < n; i++) {
        const z = srcZ[i];
        const pos = counts[(z >>> shift) & 0xff]++;
        dst[pos] = src[i];
        dstZ[pos] = z;
    }
}

// z-order of a point given coords and inverse of the longer side of data bbox
/** @param {number} x @param {number} y @param {number} minX @param {number} minY @param {number} invSize @returns {number} */
function zOrder(x, y, minX, minY, invSize) {
    // coords are transformed into non-negative 15-bit integer range
    x = (x - minX) * invSize | 0;
    y = (y - minY) * invSize | 0;

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

// find the leftmost node of a polygon ring
/** @param {Node} start @returns {Node} */
function getLeftmost(start) {
    let p = start,
        leftmost = start;
    do {
        if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
        p = p.next;
    } while (p !== start);

    return leftmost;
}

// check if a point lies within a convex triangle
/** @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} cx @param {number} cy @param {number} px @param {number} py @returns {boolean} */
function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
           (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
           (bx - px) * (cy - py) >= (cx - px) * (by - py);
}

// check if a diagonal between two polygon nodes is valid (lies in polygon interior)
/** @param {Node} a @param {Node} b @returns {boolean} true when the diagonal is valid */
function isValidDiagonal(a, b) {
    const zeroLength = equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0; // degenerate case
    return a.next.i !== b.i && (zeroLength || locallyInside(a, b) && locallyInside(b, a) && // // locally visible
        (area(a.prev, a, b.prev) !== 0 || area(a, b.prev, b) !== 0)) && // no opposite-facing sectors
        !intersectsPolygon(a, b) && (zeroLength || middleInside(a, b)); // doesn't intersect other edges, diagonal inside polygon
}

// signed area of a triangle
/** @param {Node} p @param {Node} q @param {Node} r @returns {number} */
function area(p, q, r) {
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

// check if two points are equal
/** @param {Node} p1 @param {Node} p2 @returns {boolean} */
function equals(p1, p2) {
    return p1.x === p2.x && p1.y === p2.y;
}

// check if two segments intersect; by default includes collinear boundary touches
/** @param {Node} p1 @param {Node} q1 @param {Node} p2 @param {Node} q2 @param {boolean} [includeBoundary] @returns {boolean} */
function intersects(p1, q1, p2, q2, includeBoundary = true) {
    const o1 = area(p1, q1, p2);
    const o2 = area(p1, q1, q2);
    const o3 = area(p2, q2, p1);
    const o4 = area(p2, q2, q1);

    if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;

    if (!includeBoundary) return false;

    if (o1 === 0 && onSegment(p1, p2, q1)) return true; // p1, q1 and p2 are collinear and p2 lies on p1q1
    if (o2 === 0 && onSegment(p1, q2, q1)) return true; // p1, q1 and q2 are collinear and q2 lies on p1q1
    if (o3 === 0 && onSegment(p2, p1, q2)) return true; // p2, q2 and p1 are collinear and p1 lies on p2q2
    if (o4 === 0 && onSegment(p2, q1, q2)) return true; // p2, q2 and q1 are collinear and q1 lies on p2q2

    return false;
}

// for collinear points p, q, r, check if point q lies on segment pr
/** @param {Node} p @param {Node} q @param {Node} r @returns {boolean} */
function onSegment(p, q, r) {
    return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

// check if a polygon diagonal intersects any polygon segments
/** @param {Node} a @param {Node} b @returns {boolean} */
function intersectsPolygon(a, b) {
    // diagonal bbox; an edge whose bbox can't overlap it can't intersect it, so
    // skip the orientation test for those (the common case — the diagonal is short)
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);

    let p = a;
    do {
        const n = p.next;
        if ((p.x > maxX && n.x > maxX) || (p.x < minX && n.x < minX) ||
            (p.y > maxY && n.y > maxY) || (p.y < minY && n.y < minY)) {
            p = n;
            continue;
        }
        if (p.i !== a.i && n.i !== a.i && p.i !== b.i && n.i !== b.i &&
                intersects(p, n, a, b)) return true;
        p = n;
    } while (p !== a);

    return false;
}

// check if a polygon diagonal is locally inside the polygon
/** @param {Node} a @param {Node} b @returns {boolean} */
function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0 ?
        area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
        area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
}

// check if the middle point of a polygon diagonal is inside the polygon
/** @param {Node} a @param {Node} b @returns {boolean} */
function middleInside(a, b) {
    let p = a;
    let inside = false;
    const px = (a.x + b.x) / 2;
    const py = (a.y + b.y) / 2;
    do {
        const n = p.next;
        if (((p.y > py) !== (n.y > py)) && (px < (n.x - p.x) * (py - p.y) / (n.y - p.y) + p.x))
            inside = !inside;
        p = n;
    } while (p !== a);

    return inside;
}

// link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
// if one belongs to the outer ring and another to a hole, it merges it into a single ring
/** @param {Node} a @param {Node} b @returns {Node} */
function splitPolygon(a, b) {
    const a2 = createNode(a.i, a.x, a.y),
        b2 = createNode(b.i, b.x, b.y),
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

    return b2;
}

// create a node and optionally link it with previous one (in a circular doubly linked list)
/** @param {number} i @param {number} x @param {number} y @param {Node | null} last @returns {Node} */
function insertNode(i, x, y, last) {
    const p = createNode(i, x, y);

    if (!last) {
        p.prev = p;
        p.next = p;

    } else {
        p.next = last.next;
        p.prev = last;
        last.next.prev = p;
        last.next = p;
    }
    return p;
}

/** @param {Node} p */
function removeNode(p) {
    p.next.prev = p.prev;
    p.prev.next = p.next;

    if (p.prevZ) p.prevZ.nextZ = p.nextZ;
    if (p.nextZ) p.nextZ.prevZ = p.prevZ;

    // keep the hole-bridge index's block bboxes covering the healed prev->next edge
    if (indexActive) growBlock(p.prev, p.next);
}

/** @param {number} i @param {number} x @param {number} y @returns {Node} */
function createNode(i, x, y) {
    // prev/next are assigned by the caller before any read, so the null init is cast away here
    return /** @type {Node} */ (/** @type {unknown} */ ({
        i, // vertex index in coordinates array
        x, y, // vertex coordinates
        prev: null, // previous and next vertex nodes in a polygon ring
        next: null,
        z: 0, // z-order curve value; doubles as owning block in the hole-bridge index during eliminateHoles
        prevZ: null, // previous and next nodes in z-order
        nextZ: null
    }));
}

/**
 * Return the relative difference between the polygon area and the area of its triangulation —
 * a value near 0 means a correct triangulation. Useful for verifying output in tests.
 *
 * @param {ArrayLike<number>} data
 * @param {ArrayLike<number> | null} holeIndices
 * @param {number} dim number of coordinates per vertex in `data`
 * @param {ArrayLike<number>} triangles output of {@link earcut}
 * @returns {number}
 * @example deviation(data, holes, dim, earcut(data, holes, dim)); // ~0 if correct
 */
export function deviation(data, holeIndices, dim, triangles) {
    const hasHoles = holeIndices && holeIndices.length;
    const outerLen = hasHoles ? holeIndices[0] * dim : data.length;

    let polygonArea = Math.abs(signedArea(data, 0, outerLen, dim));
    if (hasHoles) {
        for (let i = 0, len = holeIndices.length; i < len; i++) {
            const start = holeIndices[i] * dim;
            const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
            polygonArea -= Math.abs(signedArea(data, start, end, dim));
        }
    }

    let trianglesArea = 0;
    for (let i = 0; i < triangles.length; i += 3) {
        const a = triangles[i] * dim;
        const b = triangles[i + 1] * dim;
        const c = triangles[i + 2] * dim;
        trianglesArea += Math.abs(
            (data[a] - data[c]) * (data[b + 1] - data[a + 1]) -
            (data[a] - data[b]) * (data[c + 1] - data[a + 1]));
    }

    return polygonArea === 0 && trianglesArea === 0 ? 0 :
        Math.abs((trianglesArea - polygonArea) / polygonArea);
}

/** @param {ArrayLike<number>} data @param {number} start @param {number} end @param {number} dim @returns {number} */
function signedArea(data, start, end, dim) {
    let sum = 0;
    for (let i = start, j = end - dim; i < end; i += dim) {
        sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
        j = i;
    }
    return sum;
}

/**
 * Turn a polygon in multi-dimensional array form (e.g. as in GeoJSON) into the flat form Earcut accepts.
 *
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} data array of rings; the first ring is the outer contour, the rest are holes
 * @returns {{vertices: number[], holes: number[], dimensions: number}}
 * @example const {vertices, holes, dimensions} = flatten(geojson.coordinates);
 */
export function flatten(data) {
    const vertices = [];
    const holes = [];
    const dimensions = data[0][0].length;
    let holeIndex = 0;
    let prevLen = 0;

    for (const ring of data) {
        for (const p of ring) {
            for (let d = 0; d < dimensions; d++) vertices.push(p[d]);
        }
        if (prevLen) {
            holeIndex += prevLen;
            holes.push(holeIndex);
        }
        prevLen = ring.length;
    }
    return {vertices, holes, dimensions};
}
