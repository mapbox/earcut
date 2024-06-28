## Earcut

The fastest and smallest JavaScript polygon triangulation library. 3KB gzipped.

[![Node](https://github.com/mapbox/earcut/actions/workflows/node.yml/badge.svg)](https://github.com/mapbox/earcut/actions/workflows/node.yml)
[![Average time to resolve an issue](http://isitmaintained.com/badge/resolution/mapbox/earcut.svg)](http://isitmaintained.com/project/mapbox/earcut "Average time to resolve an issue")
[![Percentage of issues still open](http://isitmaintained.com/badge/open/mapbox/earcut.svg)](http://isitmaintained.com/project/mapbox/earcut "Percentage of issues still open")
[![](https://img.shields.io/badge/simply-awesome-brightgreen.svg)](https://github.com/mourner/projects)

#### The algorithm

The library implements a modified ear slicing algorithm,
optimized by [z-order curve](http://en.wikipedia.org/wiki/Z-order_curve) hashing
and extended to handle holes, twisted polygons, degeneracies and self-intersections
in a way that doesn't _guarantee_ correctness of triangulation,
but attempts to always produce acceptable results for practical data.

It's based on ideas from
[FIST: Fast Industrial-Strength Triangulation of Polygons](http://www.cosy.sbg.ac.at/~held/projects/triang/triang.html) by Martin Held
and [Triangulation by Ear Clipping](http://www.geometrictools.com/Documentation/TriangulationByEarClipping.pdf) by David Eberly.

#### Why another triangulation library?

The aim of this project is to create a JS triangulation library
that is **fast enough for real-time triangulation in the browser**,
sacrificing triangulation quality for raw speed and simplicity,
while being robust enough to handle most practical datasets without crashing or producing garbage.
Some benchmarks using Node 0.12:

(ops/sec)         | pts  | earcut    | libtess  | poly2tri | pnltri    | polyk
------------------| ---- | --------- | -------- | -------- | --------- | ------
OSM building      | 15   | _795,935_ | _50,640_ | _61,501_ | _122,966_ | _175,570_
dude shape        | 94   | _35,658_  | _10,339_ | _8,784_  | _11,172_  | _13,557_
holed dude shape  | 104  | _28,319_  | _8,883_  | _7,494_  | _2,130_   | n/a
complex OSM water | 2523 | _543_     | _77.54_  | failure  | failure   | n/a
huge OSM water    | 5667 | _95_      | _29.30_  | failure  | failure   | n/a

The original use case it was created for is [Mapbox GL](https://www.mapbox.com/mapbox-gl), WebGL-based interactive maps.

If you want to get correct triangulation even on very bad data with lots of self-intersections
and earcut is not precise enough, take a look at [libtess.js](https://github.com/brendankenny/libtess.js).

#### Usage

```js
const triangles = earcut([10,0, 0,50, 60,60, 70,10]); // returns [1,0,3, 3,2,1]
```

Signature: `earcut(vertices[, holes, dimensions = 2])`.

* `vertices` is a flat array of vertex coordinates like `[x0,y0, x1,y1, x2,y2, ...]`.
* `holes` is an array of hole _indices_ if any
  (e.g. `[5, 8]` for a 12-vertex input would mean one hole with vertices 5&ndash;7 and another with 8&ndash;11).
* `dimensions` is the number of coordinates per vertex in the input array (`2` by default). Only two are used for triangulation (`x` and `y`), and the rest are ignored.

Each group of three vertex indices in the resulting array forms a triangle.

```js
// triangulating a polygon with a hole
earcut([0,0, 100,0, 100,100, 0,100,  20,20, 80,20, 80,80, 20,80], [4]);
// [3,0,4, 5,4,0, 3,4,7, 5,0,1, 2,3,7, 6,5,1, 2,7,6, 6,1,2]

// triangulating a polygon with 3d coords
earcut([10,0,1, 0,50,2, 60,60,3, 70,10,4], null, 3);
// [1,0,3, 3,2,1]
```

If you pass a single vertex as a hole, Earcut treats it as a Steiner point.

Note that Earcut is a **2D** triangulation algorithm, and handles 3D data as if it was projected onto the XY plane (with Z component ignored).

If your input is a multi-dimensional array (e.g. [GeoJSON Polygon](http://geojson.org/geojson-spec.html#polygon)),
you can convert it to the format expected by Earcut with `earcut.flatten`:

```js
const data = earcut.flatten(geojson.geometry.coordinates);
const triangles = earcut(data.vertices, data.holes, data.dimensions);
```

After getting a triangulation, you can verify its correctness with `earcut.deviation`:

```js
const deviation = earcut.deviation(vertices, holes, dimensions, triangles);
```

Returns the relative difference between the total area of triangles and the area of the input polygon.
`0` means the triangulation is fully correct.

#### Install

Install with NPM: `npm install earcut`, then import as a module:

```js
import earcut from 'earcut';
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

![](https://cloud.githubusercontent.com/assets/25395/5778431/e8ec0c10-9da3-11e4-8d4e-a2ced6a7d2b7.png)

#### Ports to other languages

- [mapbox/earcut.hpp](https://github.com/mapbox/earcut.hpp) (C++11)
- [JaffaKetchup/dart_earcut](https://github.com/JaffaKetchup/dart_earcut) (Dart)
- [earcut4j/earcut4j](https://github.com/earcut4j/earcut4j) (Java)
- [the3deers/earcut-java](https://github.com/the3deers/earcut-java) (Java)
- [Larpon/earcut](https://github.com/Larpon/earcut) (V)
- [Cawfree/earcut-j](https://github.com/Cawfree/earcut-j) (Java, outdated)
