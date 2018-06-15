const earcut_js = require('./src/earcut');
const earcut_wasm = require('./earcut').earcut_flat;

const Benchmark = require('benchmark');

const samples = {
    'typical OSM building': earcut_js.flatten(require('./test/fixtures/building.json')),
    'dude shape': earcut_js.flatten(require('./test/fixtures/dude.json')),
    'complex OSM water': earcut_js.flatten(require('./test/fixtures/water.json'))
};

for (const name in samples) {
    const {vertices, holes} = samples[name];
    const verticesArray = Float64Array.from(vertices);
    const holesArray = Float32Array.from(holes);
    new Benchmark.Suite()
        .add(`JS ${name} (${vertices.length / 2} vertices):`, function () {
            earcut_js(vertices, holes);
        })
        .add(`WASM ${name} (${vertices.length / 2} vertices):`, function () {
            earcut_wasm(verticesArray, holesArray);
        })
        .on('cycle', (e) => console.log(String(e.target)))
        .run();
}
