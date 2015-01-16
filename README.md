## Earcut

The fastest and smallest JavaScript polygon triangulation library for your WebGL apps.

The library implements an ear slicing algorithm which is extended to handle holes, twisted polygons,
degeneracies and self-intersections in a way that doesn't _guarantee_ correctness of triangulation,
but attempts to always produce acceptable results for practical data like geographical shapes.

It's based on ideas from
[FIST: Fast Industrial-Strength Triangulation of Polygons](http://www.cosy.sbg.ac.at/~held/projects/triang/triang.html) paper.

#### Why another triangulation library?

The aim of this project is to create a JS triangulation library that is **fast enough for real-time triangulation in the browser**,
sacrificing triangulation quality for raw speed.

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
