#![feature(slice_patterns)]
#![feature(iterator_flatten)]
#![feature(test)]

extern crate typed_arena;
extern crate itertools;

use std::cell::Cell;
use std::iter;
use std::cmp::Ordering::Equal;
use typed_arena::Arena;

#[derive(Debug, PartialEq, Clone, Copy)]
pub struct Point(f64, f64);

impl Point {
    fn min(self, p: Point) -> Point {
        Point(f64::min(self.0, p.0), 
              f64::min(self.1, p.1))
    }

    fn max(self, p: Point) -> Point {
        Point(f64::max(self.0, p.0),
              f64::max(self.1, p.1))
    }
}

struct Node<'a> {
    i: usize,
    p: Point,

    // previous and next vertice nodes in a polygon ring
    _prev: Cell<&'a Node<'a>>,
    _next: Cell<&'a Node<'a>>,

    // z-order curve value
    z: Cell<i32>,

    // previous and next nodes in z-order
    _prev_z: Cell<Option<&'a Node<'a>>>,
    _next_z: Cell<Option<&'a Node<'a>>>,

    // indicates whether this is a steiner point
    steiner: Cell<bool>,
}

impl<'a> Node<'a> {
    fn prev(&self) -> &'a Node<'a> { self._prev.get() }
    fn next(&self) -> &'a Node<'a> { self._next.get() }

    fn prev_z(&self) -> Option<&'a Node<'a>> { self._prev_z.get() }
    fn next_z(&self) -> Option<&'a Node<'a>> { self._next_z.get() }

    // check whether a polygon node forms a valid ear with adjacent nodes
    fn is_ear(&'a self, hash: &Option<HashParameters>) -> bool {
        let a = self.prev().p;
        let b = self.p;
        let c = self.next().p;

        if area(a, b, c) >= 0. {
            return false; // reflex, can't be an ear
        }

        if let &Some(ref hash) = hash {
            // z-order range for the current triangle bbox
            let min_z = hash.z_order(a.min(b.min(c)));
            let max_z = hash.z_order(a.max(b.max(c)));

            let mut p = self.prev_z();
            let mut n = self.next_z();

            // look for points inside the triangle in both directions
            while let (Some(pp), Some(nn)) = (p, n) {
                if pp.z.get() < min_z { break; }
                if nn.z.get() > max_z { break; }

                if pp != self.prev() && pp != self.next() &&
                    point_in_triangle(a, b, c, pp.p) &&
                    area(pp.prev().p, pp.p, pp.next().p) >= 0. { return false; }

                if nn != self.prev() && nn != self.next() &&
                    point_in_triangle(a, b, c, nn.p) &&
                    area(nn.prev().p, nn.p, nn.next().p) >= 0. { return false; }

                p = pp.prev_z();
                n = nn.next_z();
            }

            // look for remaining points in decreasing z-order
            while let Some(pp) = p {
                if pp.z.get() < min_z { break; }

                if pp != self.prev() && pp != self.next() &&
                    point_in_triangle(a, b, c, pp.p) &&
                    area(pp.prev().p, pp.p, pp.next().p) >= 0. { return false; }

                p = pp.prev_z();
            }

            // look for remaining points in increasing z-order
            while let Some(nn) = n {
                if nn.z.get() > max_z { break; }

                if nn != self.prev() && nn != self.next() &&
                    point_in_triangle(a, b, c, nn.p) &&
                    area(nn.prev().p, nn.p, nn.next().p) >= 0. { return false; }

                n = nn.next_z();
            }
        } else {
            // now make sure we don't have other points inside the potential ear
            let mut p = self.next().next();
            while p != self.prev() {
                if point_in_triangle(a, b, c, p.p) && area(p.prev().p, p.p, p.next().p) >= 0. {
                    return false;
                }
                p = p.next();
            }
        }

        true
    }

    // Self-referential struct initialization. Must replace _prev and _next.
    unsafe fn new(i: usize, p: Point, arena: &'a Arena<Node<'a>>) -> &'a Node<'a> {
        arena.alloc(Node {
            i,
            p,
            _prev: Cell::new(std::mem::transmute(0 as usize)),
            _next: Cell::new(std::mem::transmute(0 as usize)),
            z: Cell::new(0),
            _prev_z: Cell::new(None),
            _next_z: Cell::new(None),
            steiner: Cell::new(false)
        })
    }

    fn append(tail: Option<&'a Node<'a>>, i: usize, p: Point, arena: &'a Arena<Node<'a>>) -> Option<&'a Node<'a>> {
        let node = unsafe { Node::new(i, p, arena) };

        match tail {
            None => {
                node._prev.set(&node);
                node._next.set(&node);
            },
            Some(last) => {
                node._next.set(last.next());
                node._prev.set(last);
                last.next()._prev.set(&node);
                last._next.set(&node);
            }
        }

        Some(node)
    }

    // link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
    // if one belongs to the outer ring and another to a hole, it merges it into a single ring
    fn split_polygon(a: &'a Node<'a>,
                     b: &'a Node<'a>,
                     arena: &'a Arena<Node<'a>>) -> &'a Node<'a> {
        let an = a.next();
        let bp = b.prev();

        a._next.set(b);
        b._prev.set(a);

        let a2 = unsafe { Node::new(a.i, a.p, arena) };
        let b2 = unsafe { Node::new(b.i, b.p, arena) };

        a2._next.set(an);
        a2._prev.set(b2);

        b2._next.set(a2);
        b2._prev.set(bp);

        an._prev.set(a2);
        bp._next.set(b2);

        b2
    }

    fn remove(&self) {
        self.next()._prev.set(self.prev());
        self.prev()._next.set(self.next());

        if let Some(ref pz) = self.prev_z() {
            pz._next_z.set(self.next_z())
        }
        if let Some(ref nz) = self.next_z() {
            nz._prev_z.set(self.prev_z())
        }
    }
}

impl<'a> PartialEq for &'a Node<'a> {
    fn eq(&self, other: &&'a Node<'a>) -> bool {
        *self as *const _ == *other as *const _
    }
}

struct HashParameters {
    min: Point,
    inv_size: f64
}

impl HashParameters {
    fn new<'a>(head: &'a Node<'a>, vertices: usize) -> Option<HashParameters> {
        // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
        if vertices <= 80 {
            return None;
        }

        let mut min = head.p;
        let mut max = head.p;

        let mut p = head.next();
        loop {
            min = min.min(p.p);
            max = max.max(p.p);
            p = p.next();
            if p == head {
                break;
            }
        }

        // minX, minY and size are later used to transform coords into integers for z-order calculation
        let mut inv_size = f64::max(max.0 - min.0, max.1 - min.1);
        inv_size = if inv_size != 0. { 1. / inv_size } else { 0. };

        Some(HashParameters { min, inv_size })
    }

    // z-order of a point given coords and inverse of the longer side of data bbox
    fn z_order(&self, p: Point) -> i32 {
        // coords are transformed into non-negative 15-bit integer range
        let mut x = (32767. * (p.0 - self.min.0) * self.inv_size) as i32;
        let mut y = (32767. * (p.1 - self.min.1) * self.inv_size) as i32;

        x = (x | (x << 8)) & 0x00FF00FF;
        x = (x | (x << 4)) & 0x0F0F0F0F;
        x = (x | (x << 2)) & 0x33333333;
        x = (x | (x << 1)) & 0x55555555;

        y = (y | (y << 8)) & 0x00FF00FF;
        y = (y | (y << 4)) & 0x0F0F0F0F;
        y = (y | (y << 2)) & 0x33333333;
        y = (y | (y << 1)) & 0x55555555;

        x | (y << 1)
    }
}

#[derive(PartialEq)]
enum Pass { _0, _1, _2 }

pub fn earcut(polygon: &Vec<Vec<Point>>) -> Vec<[usize; 3]> {
    match polygon.as_slice() {
        &[] => Vec::new(),
        &[ref outer, ref inners..] => {
            let arena = Arena::new();
            let mut indices = Vec::new();
            let mut vertices = 0;

            if let Some(mut head) = linked_list(&outer, true, vertices, &arena) {
                vertices += outer.len();

                // link every hole into the outer loop, producing a single-ring polygon without holes

                let mut queue = Vec::new();

                for ring in inners {
                    if let Some(list) = linked_list(&ring, false, vertices, &arena) {
                        if list == list.next() {
                            list.steiner.set(true);
                        }
                        queue.push(get_leftmost(list));
                    }
                    vertices += ring.len();
                }

                // process holes from left to right
                queue.sort_unstable_by(|a, b| f64::partial_cmp(&a.p.0, &b.p.0).unwrap_or(Equal));
                for e in queue.iter() {
                    eliminate_hole(e, head, &arena);
                    head = filter_points(head, head.next());
                }

                earcut_linked(head, &mut indices, &HashParameters::new(head, vertices), &arena, Pass::_0);
            }

            indices
        }
    }
}

fn twice_signed_area(points: &Vec<Point>) -> f64 {
    use itertools::Itertools;
    iter::once((points.last().unwrap(), points.first().unwrap()))
        .chain(points.iter().tuple_windows())
        .map(|(p1, p2)| (p1.0 - p2.0) * (p1.1 + p2.1))
        .sum::<f64>()
}

// create a circular doubly linked list from polygon points in the specified winding order
fn linked_list<'a>(points: &Vec<Point>, 
                   clockwise: bool, 
                   vertices: usize,
                   arena: &'a Arena<Node<'a>>) -> Option<&'a Node<'a>> {
    // link points into circular doubly-linked list in the specified winding order
    let mut last = None;

    if clockwise == (twice_signed_area(points) > 0.) {
        for (i, &p) in points.iter().enumerate() {
            last = Node::append(last, vertices + i, p, arena);
        }
    } else {
        for (i, &p) in points.iter().enumerate().rev() {
            last = Node::append(last, vertices + i, p, arena);
        }
    }

    if let Some(last) = last {
        if last.p == last.next().p {
            last.remove();
            return Some(last.next());
        }
    }

    last
}

// main ear slicing loop which triangulates a polygon (given as a linked list)
fn earcut_linked<'a>(mut ear: &'a Node<'a>,
                     indices: &mut Vec<[usize; 3]>,
                     hash: &Option<HashParameters>,
                     arena: &'a Arena<Node<'a>>,
                     pass: Pass) {
    // interlink polygon nodes in z-order
    if let (&Pass::_0, &Some(ref hash)) = (&pass, hash) {
        index_curve(ear, hash);
    }

    let mut stop = ear;

    // iterate through ears, slicing them one by one
    loop {
        let prev = ear.prev();
        let next = ear.next();

        if prev == next {
            break;
        }

        if ear.is_ear(hash) {
            // cut off the triangle
            indices.push([prev.i, ear.i, next.i]);
            ear.remove();

            // skipping the next vertex leads to less sliver triangles
            ear = next.next();
            stop = next.next();

            continue;
        }

        ear = next;

        // if we looped through the whole remaining polygon and can't find any more ears
        if ear == stop {
            match pass {
                // try filtering points and slicing again
                Pass::_0 => earcut_linked(filter_points(ear, ear), indices, hash, arena, Pass::_1),

                // if this didn't work, try curing all small self-intersections locally
                Pass::_1 => earcut_linked(cure_local_intersections(ear, indices), indices, hash, arena, Pass::_2),

                // as a last resort, try splitting the remaining polygon into two
                Pass::_2 => split_earcut(ear, indices, hash, arena)
            }

            break;
        }
    }
}

// go through all polygon nodes and cure small local self-intersections
fn cure_local_intersections<'a>(mut start: &'a Node<'a>,
                                indices: &mut Vec<[usize; 3]>) -> &'a Node<'a> {
    let mut p = start;

    loop {
        let a = p.prev();
        let b = p.next().next();

        if a.p != b.p && intersects(a.p, p.p, p.next().p, b.p) && locally_inside(a, b) && locally_inside(b, a) {
            indices.push([a.i, p.i, b.i]);

            // remove two nodes involved
            p.remove();
            p.next().remove();

            start = b;
            p = start;
        }

        p = p.next();
        if p == start {
            break;
        }
    }

    p
}

// try splitting polygon into two and triangulate them independently
fn split_earcut<'a>(start: &'a Node<'a>,
                    indices: &mut Vec<[usize; 3]>,
                    hash: &Option<HashParameters>,
                    arena: &'a Arena<Node<'a>>) {
    // look for a valid diagonal that divides the polygon into two
    let mut a = start;
    loop {
        let mut b = a.next().next();
        while b != a.prev() {
            if a.i != b.i && is_valid_diagonal(a, b) {
                // split the polygon in two by the diagonal
                let mut c = Node::split_polygon(a, b, arena);

                // filter colinear points around the cuts
                a = filter_points(a, a.next());
                c = filter_points(c, c.next());

                // run earcut on each half
                earcut_linked(a, indices, hash, arena, Pass::_0);
                earcut_linked(c, indices, hash, arena, Pass::_0);
                return;
            }
            b = b.next();
        }
        a = a.next();
        if a == start {
            break;
        }
    }
}

// find a bridge between vertices that connects hole with an outer ring and and link it
fn eliminate_hole<'a>(hole: &'a Node<'a>, 
                      outer_node: &'a Node<'a>,
                      arena: &'a Arena<Node<'a>>) {
    if let Some(outer_node) = find_hole_bridge(hole, outer_node) {
        let b = Node::split_polygon(outer_node, hole, arena);
        filter_points(b, b.next());
    }
}

// interlink polygon nodes in z-order
fn index_curve<'a>(start: &'a Node<'a>, hash: &HashParameters) {
    let mut p = start;
    loop {
        if p.z.get() == 0 {
            p.z.set(hash.z_order(p.p));
        }
        p._prev_z.set(Some(p.prev()));
        p._next_z.set(Some(p.next()));
        p = p.next();
        if p == start {
            break;
        }
    }

    p.prev_z().unwrap()._next_z.set(None);
    p._prev_z.set(None);

    sort_linked(p);
}

// eliminate colinear or duplicate points
fn filter_points<'a>(mut p: &'a Node<'a>, mut end: &'a Node<'a>) -> &'a Node<'a> {
    loop {
        if !p.steiner.get() && (p.p == p.next().p || area(p.prev().p, p.p, p.next().p) == 0.) {
            p.remove();
            end = p.prev();
            p = end;
            if p == p.next() {
                return end;
            }
        } else {
            p = p.next();
            if p == end {
                return end;
            }
        }
    }
}

// David Eberly's algorithm for finding a bridge between hole and outer polygon
fn find_hole_bridge<'a>(hole: &'a Node<'a>, outer_node: &'a Node<'a>) -> Option<&'a Node<'a>> {
    let mut p = outer_node;
    let h = hole.p;
    let mut qx = -std::f64::INFINITY;
    let mut m = None;

    // find a segment intersected by a ray from the hole's leftmost point to the left;
    // segment's endpoint with lesser x will be potential connection point
    loop {
        let next = p.next();
        if h.1 <= p.p.1 && h.1 >= next.p.1 && next.p.1 != p.p.1 {
            let x = p.p.0 + (h.1 - p.p.1) * (next.p.0 - p.p.0) / (next.p.1 - p.p.1);
            if x <= h.0 && x > qx {
                qx = x;
                if x == h.0 {
                    if h.1 == p.p.1 {
                        return Some(p);
                    }
                    if h.1 == next.p.1 {
                        return Some(next);
                    }
                }
                m = Some(if p.p.0 < next.p.0 { p } else { next });
            }
        }
        p = next;
        if p == outer_node {
            break;
        }
    }

    if m.is_none() {
        return None;
    }

    let mut m = m.unwrap();

    if h.0 == qx {
        return Some(m.prev()); // hole touches outer segment; pick lower endpoint
    }

    // look for points inside the triangle of hole point, segment intersection and endpoint;
    // if there are no points found, we have a valid connection;
    // otherwise choose the point of the minimum angle with the ray as connection point

    let stop = m;
    let mp = m.p;
    let mut tan_min = std::f64::INFINITY;

    p = m.next();

    while p != stop {
        if h.0 >= p.p.0 && p.p.0 >= mp.0 && h.0 != p.p.0 &&
            point_in_triangle(Point(if h.1 < mp.1 { h.0 } else { qx }, h.1),
                              mp,
                              Point(if h.1 < mp.1 { qx } else { h.0 }, h.1),
                              p.p) {

            let tan = (h.1 - p.p.1).abs() / (h.0 - p.p.0); // tangential
            if (tan < tan_min || (tan == tan_min && p.p.0 > m.p.0)) && locally_inside(p, hole) {
                m = p;
                tan_min = tan;
            }
        }

        p = p.next();
    }

    Some(m)
}

// Simon Tatham's linked list merge sort algorithm
// http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
fn sort_linked<'a>(list: &'a Node<'a>) {
    let mut list = Some(list);
    let mut in_size = 1;

    loop {
        let mut p = list;
        let mut tail: Option<&'a Node<'a>> = None;
        let mut num_merges = 0;

        list = None;

        while p.is_some() {
            num_merges += 1;

            let mut q = p;
            let mut p_size = 0;
            for _ in 0..in_size {
                p_size += 1;
                q = q.unwrap().next_z();
                if q.is_none() {
                    break;
                }
            }

            let mut q_size = in_size;
            while p_size > 0 || (q_size > 0 && q.is_some()) {
                let e;

                if p_size != 0 && (q_size == 0 || q.is_none() || p.unwrap().z <= q.unwrap().z) {
                    e = p;
                    p = p.unwrap().next_z();
                    p_size -= 1;
                } else {
                    e = q;
                    q = q.unwrap().next_z();
                    q_size -= 1;
                }

                match tail {
                    Some(tail) => tail._next_z.set(e),
                    None => list = e
                }

                e.unwrap()._prev_z.set(tail);
                tail = e;
            }

            p = q;
        }

        tail.unwrap()._next_z.set(None);

        if num_merges <= 1 {
            break;
        }

        in_size *= 2;
    }
}

// find the leftmost node of a polygon ring
fn get_leftmost<'a>(start: &'a Node<'a>) -> &'a Node<'a> {
    let mut p = start;
    let mut leftmost = start;
    loop {
        if p.p.0 < leftmost.p.0 {
            leftmost = p;
        }
        p = p.next();
        if p == start {
            return leftmost
        }
    }
}

// check if a point lies within a convex triangle
fn point_in_triangle(Point(ax, ay): Point,
                     Point(bx, by): Point,
                     Point(cx, cy): Point,
                     Point(px, py): Point) -> bool {
    (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0. &&
    (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0. &&
    (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0.
}

// check if a diagonal between two polygon nodes is valid (lies in polygon interior)
fn is_valid_diagonal<'a>(a: &'a Node<'a>, b: &'a Node<'a>) -> bool {
    a.next().i != b.i && a.prev().i != b.i && !intersects_polygon(a, b) &&
        locally_inside(a, b) && locally_inside(b, a) && middle_inside(a, b)
}

// signed area of a triangle
fn area(p: Point, q: Point, r: Point) -> f64 {
    (q.1 - p.1) * (r.0 - q.0) - (q.0 - p.0) * (r.1 - q.1)
}

// check if two segments intersect
fn intersects(p1: Point, q1: Point, p2: Point, q2: Point) -> bool {
    (p1 == q1 && p2 == q2) || 
    (p1 == q2 && p2 == q1) ||
    ((area(p1, q1, p2) > 0.) != (area(p1, q1, q2) > 0.) && 
     (area(p2, q2, p1) > 0.) != (area(p2, q2, q1) > 0.))
}

// check if a polygon diagonal intersects any polygon segments
fn intersects_polygon<'a>(a: &'a Node<'a>, b: &'a Node<'a>) -> bool {
    let mut p = a;
    loop {
        let next = p.next();
        if p.i != a.i && next.i != a.i && p.i != b.i && next.i != b.i && intersects(p.p, next.p, a.p, b.p) {
            return true;
        }
        p = next;
        if p == a {
            return false;
        }
    }
}

// check if a polygon diagonal is locally inside the polygon
fn locally_inside<'a>(a: &'a Node<'a>, b: &'a Node<'a>) -> bool {
    if area(a.prev().p, a.p, a.next().p) < 0. {
        area(a.p, b.p, a.next().p) >= 0. && area(a.p, a.prev().p, b.p) >= 0.
    } else {
        area(a.p, b.p, a.prev().p) < 0. || area(a.p, a.next().p, b.p) < 0.
    }
}

// check if the middle point of a polygon diagonal is inside the polygon
fn middle_inside<'a>(a: &'a Node<'a>, b: &'a Node<'a>) -> bool {
    let mut p = a;
    let mut inside = false;
    let px = (a.p.0 + b.p.0) / 2.;
    let py = (a.p.1 + b.p.1) / 2.;

    loop {
        let next = p.next();
        if (p.p.1 > py) != (next.p.1 > py) && next.p.1 != p.p.1 && (px < (next.p.0 - p.p.0) * (py - p.p.1) / (next.p.1 - p.p.1) + p.p.0) {
            inside = !inside;
        }
        p = next;
        if p == a {
            break;
        }
    }

    inside
}

#[cfg(test)]
mod tests {
    use super::*;

    extern crate serde;
    extern crate serde_json;
    use std::{fs, env};
    use self::serde::{Deserialize, Deserializer};

    impl<'de> Deserialize<'de> for Point {
        fn deserialize<D>(deserializer: D) -> Result<Point, D::Error>
            where D: Deserializer<'de>
        {
            Deserialize::deserialize(deserializer)
                .map(|(x, y)| Point(x, y))
        }
    }

    fn polygon_area(polygon: &Vec<Vec<Point>>) -> f64 {
        polygon.iter()
            .enumerate()
            .map(|(i, r)| f64::abs(twice_signed_area(r)) / 2. * if i == 0 { 1. } else { -1. })
            .sum()
    }

    fn triangles_area(polygon: &Vec<Vec<Point>>, indices: &Vec<[usize; 3]>) -> f64 {
        let flattened = polygon.iter().flatten().collect::<Vec<&Point>>();
        indices.iter()
            .map(|&[a, b, c]| f64::abs(area(*flattened[a], *flattened[b], *flattened[c])) / 2.)
            .sum()
    }
    
    fn load(file: &str) -> Vec<Vec<Point>> {
        let mut path = env::current_dir().unwrap();
        path.push("test");
        path.push("fixtures");
        path.push(file);
        path.set_extension("json");
        serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
    }

    fn fixture(file: &str, expected_triangles: usize, expected_deviation: f64) {
        let input = load(file);
        let output = earcut(&input);

        assert_eq!(output.len(), expected_triangles);

        let polygon_area = polygon_area(&input);
        let triangles_area = triangles_area(&input, &output);
        let deviation = if polygon_area == 0. && triangles_area == 0. { 0. } else { f64::abs((triangles_area - polygon_area) / polygon_area) };

        assert!(deviation < expected_deviation, "expected {} < {}", deviation, expected_deviation);
    }

    #[test]
    fn fixtures() {
        fixture("building", 13, 1e-14);
        fixture("dude", 106, 1e-14);
        fixture("water", 2482, 0.0008);
        fixture("water2", 1212, 1e-14);
        fixture("water3", 197, 1e-14);
        fixture("water3b", 25, 1e-14);
        fixture("water4", 705, 1e-14);
        fixture("water-huge", 5174, 0.0011);
        fixture("water-huge2", 4461, 0.0028);
        fixture("degenerate", 0, 1e-14);
        fixture("bad-hole", 42, 0.019);
        fixture("empty-square", 0, 1e-14);
        fixture("issue16", 12, 1e-14);
        fixture("issue17", 11, 1e-14);
        fixture("steiner", 9, 1e-14);
        fixture("issue29", 40, 1e-14);
        fixture("issue34", 139, 1e-14);
        fixture("issue35", 844, 1e-14);
        fixture("self-touching", 124, 3.4e-14);
        fixture("outside-ring", 64, 1e-14);
        fixture("simplified-us-border", 120, 1e-14);
        fixture("touching-holes", 57, 1e-14);
        fixture("hole-touching-outer", 77, 1e-14);
        fixture("hilbert", 1024, 1e-14);
        fixture("issue45", 10, 1e-14);
        fixture("eberly-3", 73, 1e-14);
        fixture("eberly-6", 1429, 1e-14);
        fixture("issue52", 109, 1e-14);
        fixture("shared-points", 4, 1e-14);
        fixture("bad-diagonals", 7, 1e-14);
        fixture("issue83", 0, 1e-14);
    }

    extern crate test;
    use self::test::Bencher;

    #[bench]
    fn building(b: &mut Bencher) {
        let input = load("building");
        b.iter(|| earcut(&input));
    }

    #[bench]
    fn dude(b: &mut Bencher) {
        let input = load("dude");
        b.iter(|| earcut(&input));
    }

    #[bench]
    fn water(b: &mut Bencher) {
        let input = load("water");
        b.iter(|| earcut(&input));
    }
}
