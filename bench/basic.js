import {earcut, flatten} from '../src/earcut.js';
import {readFileSync} from 'fs';

const data = JSON.parse(readFileSync(new URL('../test/fixtures/building.json', import.meta.url)));
const {vertices, holes} = flatten(data);

const start = performance.now();
let ops = 0;
let passed = 0;

do {
    earcut(vertices, holes);

    ops++;
    passed = performance.now() - start;
} while (passed < 1000);

console.log(`${Math.round(ops * 1000 / passed).toLocaleString()} ops/s`);
