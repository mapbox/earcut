import terser from '@rollup/plugin-terser';

const config = (file, plugins) => ({
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
    config('dist/earcut.dev.js', []),
    config('dist/earcut.min.js', [terser()])
];
