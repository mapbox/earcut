# Earcut

The fastest and smallest JavaScript **polygon triangulation** library. 4KB gzipped.
[![Node](https://github.com/mapbox/earcut/actions/workflows/node.yml/badge.svg)](https://github.com/mapbox/earcut/actions/workflows/node.yml)
[![](https://img.shields.io/badge/simply-awesome-brightgreen.svg)](https://github.com/mourner/projects)

![Earcut triangulation example](earcut.png)

Earcut is designed to be fast enough for real-time [triangulation](https://en.wikipedia.org/wiki/Polygon_triangulation) in the browser,
favoring raw speed and simplicity over triangulation quality,
while being robust enough to handle most practical datasets without crashing or producing garbage,
with an option to refine the result to [Delaunay](https://en.wikipedia.org/wiki/Delaunay_triangulation) quality at a small cost.
Originally built for [Mapbox GL JS](https://www.mapbox.com/mapbox-gljs) (WebGL-based interactive maps),
it's now also used by [Three.js](https://threejs.org/) and many other projects.

## [Demo](https://mapbox.github.io/earcut/viz/)

## Usage

```js
import earcut from 'earcut';
const triangles = earcut([10,0, 0,50, 60,60, 70,10]); // returns [1,0,3, 1,3,2]
```

## Algorithm

The library implements a modified ear slicing algorithm,
optimized by [z-order curve](https://en.wikipedia.org/wiki/Z-order_curve) and spatial hashing
and extended to handle holes, twisted polygons, degeneracies and self-intersections
in a way that doesn't _guarantee_ correctness of triangulation,
but attempts to always produce acceptable results for practical data.

It's based on ideas from
[FIST: Fast Industrial-Strength Triangulation of Polygons](https://www.cosy.sbg.ac.at/~held/projects/triang/triang.html) by Martin Held
and [Triangulation by Ear Clipping](https://www.geometrictools.com/Documentation/TriangulationByEarClipping.pdf) by David Eberly.

## Performance

Earcut is heavily optimized for its primary workload — triangulating polygons from
[Mapbox Vector Tiles](https://github.com/mapbox/vector-tile-spec). On a representative
benchmark of **119,680 real-world polygons** (1.9M vertices) drawn from a window of map tiles
through zooms 4–16, it triangulates the whole set in **~445 ms** on a MacBook Pro M1 Pro (2021),
with optional Delaunay refinement taking additional **~168 ms**.
You can run the benchmark yourself with `npm run bench`.

## Robustness

Earcut does **not** guarantee a correct triangulation on arbitrary input — it trades quality
for speed, aiming to always produce an acceptable result on practical data without crashing or
emitting garbage. The input is assumed to be a valid polygon: rings that don't self-cross or
overlap, holes that stay inside the outer ring, and no duplicate or zero-length edges. On input
that breaks these assumptions, the result can be noticeably wrong — overlapping triangles, gaps,
or triangles outside the polygon. If correctness matters, clean your input first; for a
guaranteed-correct triangulation even on bad data, see
[libtess.js](https://github.com/brendankenny/libtess.js) (slower and larger).

The output is also not _conforming_ — a vertex may land in the middle of another triangle's edge
(a T-junction). This is harmless for rendering but can break navmesh or FEM use; if you need a
conforming mesh, [remove T-junctions in a post-process](https://github.com/mapbox/earcut/issues/74#issuecomment-4826113682).

## Install

Install with NPM: `npm install earcut`, then import as a module:

```js
import earcut, {flatten, deviation, refine} from 'earcut';
```

Or use as a module directly in the browser with [jsDelivr](https://www.jsdelivr.com/esm):

```html
<script type="module">
    import earcut from 'https://cdn.jsdelivr.net/npm/earcut/+esm';
</script>
```

Alternatively, there's a UMD browser bundle with an `earcut` global variable (exposing the main function as `earcut.default`):

```html
<script src="https://cdn.jsdelivr.net/npm/earcut/dist/earcut.min.js"></script>
```

## API

### `earcut(vertices[, holes, dimensions = 2])`

* `vertices` is a flat array of vertex coordinates like `[x0,y0, x1,y1, x2,y2, ...]`.
* `holes` is an array of hole _indices_ if any
  (e.g. `[5, 8]` for a 12-vertex input would mean one hole with vertices 5&ndash;7 and another with 8&ndash;11).
* `dimensions` is the number of coordinates per vertex in the input array (`2` by default). Earcut is a **2D** algorithm: only `x` and `y` are used for triangulation, and any extra coordinates are ignored (3D data is treated as projected onto the XY plane).

Each group of three vertex indices in the resulting array forms a triangle.

```js
// triangulating a polygon with a hole
earcut([0,0, 100,0, 100,100, 0,100,  20,20, 80,20, 80,80, 20,80], [4]);
// [0,4,7, 5,4,0, 5,0,1, 5,1,2, 3,0,7, 3,7,6, 6,5,2, 6,2,3]

// triangulating a polygon with 3d coords
earcut([10,0,1, 0,50,2, 60,60,3, 70,10,4], null, 3);
// [1,0,3, 1,3,2]
```

If you pass a single vertex as a hole, Earcut treats it as a Steiner point.

Output triangles always have a consistent **winding order** regardless of the input polygon's winding &mdash; counter-clockwise in a y-up coordinate system (clockwise in y-down/screen space). If you need the opposite orientation (e.g. for back-face culling or normals in 3D), call `.reverse()` on the result.

### `refine(triangles, vertices[, dimensions = 2])`

If triangle quality matters, you can run an optional refinement pass after triangulation:

```js
const triangles = earcut(vertices, holes, dimensions);
refine(triangles, vertices, dimensions);
```

This mutates `triangles` in place, legalizing interior edges with Delaunay flips while preserving
the polygon boundary and holes. It keeps the same number of triangles and the same index format,
but usually removes many skinny triangles and reduces total triangle edge length.

Refinement is a post-process, so it doesn't affect the speed of normal `earcut` calls unless you
explicitly call it. It assumes a valid manifold triangulation, such as the output of `earcut`, and
doesn't repair invalid polygon input or make the mesh conforming.

### `flatten(data)`

If your input is a multi-dimensional array (e.g. [GeoJSON Polygon](https://geojson.org/geojson-spec.html#polygon)),
you can convert it to the format expected by Earcut with `flatten`:

```js
const data = flatten(geojson.geometry.coordinates);
const triangles = earcut(data.vertices, data.holes, data.dimensions);
```

### `deviation(vertices, holes, dimensions, triangles)`

After getting a triangulation, you can verify its correctness with `deviation`:

```js
const d = deviation(vertices, holes, dimensions, triangles);
```

Returns the relative difference between the total area of triangles and the area of the input polygon.
`0` means the triangulation is fully correct.

## Ports to other languages

- [mapbox/earcut.hpp](https://github.com/mapbox/earcut.hpp) (C++11)
- [JaffaKetchup/dart_earcut](https://github.com/JaffaKetchup/dart_earcut) (Dart)
- [earcut4j/earcut4j](https://github.com/earcut4j/earcut4j) (Java)
- [Larpon/earcut](https://github.com/Larpon/earcut) (V)
- [measuredweighed/SwiftEarcut](https://github.com/measuredweighed/SwiftEarcut) (Swift)
- [goswinr/Earcut](https://github.com/goswinr/Earcut/) (F# / .NET)
- [tenyoru/earcut.zig](https://github.com/tenyoru/earcut.zig) (Zig)
- [MichaCo/Earcut](https://github.com/MichaCo/Earcut) (C# / .NET)
