import {earcut, flatten} from '../src/earcut.js';
import Benchmark from 'benchmark';
import {readFileSync} from 'fs';

function withoutHoles({vertices, holes, dimensions}) {
    return {
        vertices: vertices.slice(0, holes[0] * dimensions),
        holes: []
    };
}

function getFixture(name) {
    return flatten(JSON.parse(readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url))));
}

const samples = {
    'typical OSM building': getFixture('building.json'),
    'dude shape': withoutHoles(getFixture('dude.json')),
    'dude shape with holes': getFixture('dude.json'),
    'complex OSM water': getFixture('water.json')
};

for (const name in samples) {
    const {vertices, holes, dimensions} = samples[name];
    new Benchmark.Suite()
        .add(`${name} (${vertices.length / 2} vertices):`, () => {
            earcut(vertices, holes, dimensions);
        })
        .on('cycle', logCycle)
        .run();
}

function logCycle(event) {
    console.log(String(event.target));
}
