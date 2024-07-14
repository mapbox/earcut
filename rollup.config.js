import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

/**
 * @returns {import('rollup').RollupOptions}
 */
const config = (file, plugins, format) => ({
    input: 'src/earcut.ts',
    output: {
        name: 'earcut',
        exports: 'named',
        format: format,
        indent: false,
        file,
        sourcemap: true
    },
    plugins
});

export default [
    config('dist/earcut.dev.js', [typescript()], "umd"),
    config('dist/earcut.min.js', [typescript(), terser()], "umd"),
    config('dist/earcut.esm.js', [typescript()], "esm"),
];
