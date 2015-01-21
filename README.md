## Earcut

The fastest and smallest JavaScript polygon triangulation library. 1.7KB gzipped.

[![Build Status](https://travis-ci.org/mapbox/earcut.svg?branch=master)](https://travis-ci.org/mapbox/earcut)
[![Coverage Status](https://coveralls.io/repos/mapbox/earcut/badge.svg?branch=master)](https://coveralls.io/r/mapbox/earcut?branch=master)

The library implements an ear slicing algorithm which is extended to handle holes, twisted polygons,
degeneracies and self-intersections in a way that doesn't _guarantee_ correctness of triangulation,
but attempts to always produce acceptable results for practical data like geographical shapes.

It's based on ideas from
[FIST: Fast Industrial-Strength Triangulation of Polygons](http://www.cosy.sbg.ac.at/~held/projects/triang/triang.html) by Martin Held
and [Triangulation by Ear Clipping](http://www.geometrictools.com/Documentation/TriangulationByEarClipping.pdf) by David Eberly.

#### Why another triangulation library?

The aim of this project is to create a JS triangulation library
that is **fast enough for real-time triangulation in the browser**,
sacrificing triangulation quality for raw speed and simplicity,
while being robust enough to handle most practical datasets without crashing or producing garbage.
Some benchmarks:

(ops/sec)         | pts  | earcut    | libtess  | poly2tri | pnltri
------------------| ---- | --------- | -------- | -------- | ---------
OSM building      | 15   | _605,427_ | _28,124_ | _28,131_ | _210,320_
dude shape        | 94   | _28,757_  | _5,904_  | _3,544_  | _12,916_
holed dude shape  | 104  | _11,575_  | _5,204_  | _3,205_  | _2,232_
complex OSM water | 2523 | _35.93_   | _64.73_  | failure  | failure

Earcut may be slow for huge complex shapes,
but when it comes to triangulating lots of shapes with relatively low number of vertices on average
([the use case](https://github.com/mapbox/mapbox-gl-js) earcut was created for), it's much faster.

If you want a library that is more likely to produce correct triangulation even on very bad data,
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

Running tests:

```bash
npm test
```

![](https://cloud.githubusercontent.com/assets/25395/5778431/e8ec0c10-9da3-11e4-8d4e-a2ced6a7d2b7.png)

#### Changelog

##### 1.1.0 (Jan 21)

- Improved performance on complex polygons with lots of holes
by switching from Held to Eberly hole elimination algorithm

##### 1.0.1 &mdash; 1.0.6 (Jan 20, 2015)

- Various robustness improvements and fixes.

##### 1.0.0 (Jan 18, 2015)

- Initial release.
