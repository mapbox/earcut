const earcut = require('../src/earcut');

function withoutHoles({vertices, holes, dimensions}) {
    return {
        vertices: vertices.slice(0, holes[0] * dimensions),
        holes: []
    };
}

const samples = {
    'typical OSM building': earcut.flatten(require('../test/fixtures/building.json')),
    'dude shape': withoutHoles(earcut.flatten(require('../test/fixtures/dude.json'))),
    'dude shape with holes': earcut.flatten(require('../test/fixtures/dude.json')),
    'complex OSM water': earcut.flatten(require('../test/fixtures/water.json'))
};

const Benchmark = require('benchmark');

for (const name in samples) {
    const {vertices, holes, dimensions} = samples[name];
    new Benchmark.Suite()
        .add(name + ' (' + (vertices.length / 2) + ' vertices):', function () {
            earcut(vertices, holes, dimensions);
        })
        .on('cycle', logCycle)
        .run();
}

function logCycle(event) {
    console.log(String(event.target));
}
