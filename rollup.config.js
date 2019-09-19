import buble from 'rollup-plugin-buble';
import {terser} from 'rollup-plugin-terser'

const output = (file, plugins) => ({
    input: 'src/earcut.js',
    output: {
        name: 'earcut',
        format: 'umd',
        indent: false,
        file
    },
    plugins
});

export default [
    output('dist/earcut.dev.js', [buble()]),
    output('dist/earcut.min.js', [terser(), buble()])
];
