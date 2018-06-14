const earcut = require('../src/earcut');

const {vertices, holes} = earcut.flatten(require('../test/fixtures/water.json'));

let start = Date.now(),
    ops = 0;

while (Date.now() - start < 1000) {
    earcut(vertices, holes);
    ops++;
}

console.log(Math.round(ops * 1000 / (Date.now() - start)) + ' ops/s');
