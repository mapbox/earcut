## Earcut

The fastest and smallest JavaScript polygon triangulation library for your WebGL apps. 1.6KB gzipped.

The library implements an ear slicing algorithm which is extended to handle holes, twisted polygons,
degeneracies and self-intersections in a way that doesn't _guarantee_ correctness of triangulation,
but attempts to always produce acceptable results for practical data like geographical shapes.

It's based on ideas from
[FIST: Fast Industrial-Strength Triangulation of Polygons](http://www.cosy.sbg.ac.at/~held/projects/triang/triang.html) paper.

#### Why another triangulation library?

The aim of this project is to create a JS triangulation library
that is **fast enough for real-time triangulation in the browser**,
sacrificing triangulation quality for raw speed and simplicity,
while being robust enough to handle most practical datasets without crashing or producing garbage.
Some benchmarks:

(ops/sec)         | pts  | earcut    | libtess  | poly2tri | pnltri
------------------| ---- | --------- | -------- | -------- | ---------
OSM building      | 15   | _572,982_ | _28,124_ | _28,131_ | _210,320_
dude shape        | 94   | _22,238_  | _5,904_  | _3,544_  | _12,916_
holed dude shape  | 104  | _9,752_   | _5,204_  | _3,205_  | _2,232_
complex OSM water | 2523 | _29.17_   | _64.73_  | failure  | failure

Earcut may be slow for huge complex shapes,
but when it comes to triangulating lots of shapes with relatively low number of vertices on average
([the use case](https://github.com/mapbox/mapbox-gl-js) earcut was created for), it's much faster.

If you want a library that is always guaranteed to produce correct triangulation even on very bad data,
[libtess.js](https://github.com/brendankenny/libtess.js) is certainly the best choice.

#### Usage

```js
// input should be an array of rings, where the first is outer ring and others are holes;
// each ring is an array of points, where each point is of the `[x, y]` form
var points = [[[10, 0], [0, 50], [60, 60], [70, 10]]];

var trianglePoints = earcut(points);
// returns an array of points where each group of three forms a triangle
```

#### Install

NPM and Browserify:

```bash
npm install earcut
```

Browser builds:

```bash
npm install
npm run build-dev # builds dist/earcut.dev.js, a dev version with a source map
npm run build-min # builds dist/earcut.min.js, a minified production build
```

![](https://cloud.githubusercontent.com/assets/25395/5778431/e8ec0c10-9da3-11e4-8d4e-a2ced6a7d2b7.png)
