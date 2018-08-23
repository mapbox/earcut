import { uglify } from 'rollup-plugin-uglify'
import pkg from './package.json'

const createConfig = ({
    input = pkg.module,
    output,
    min = false,
} = {}) => ({
    input,
    output: Object.assign({ name: pkg.name, exports: 'named' }, output),
    plugins: [
        min && uglify({
            compress: {
                warnings: false
            },
        }),
    ].filter(Boolean)
})

export default [
    createConfig({
        output: {
            file: pkg.main,
            format: 'cjs',
        },
    }),
    createConfig({
        output: {
            file: pkg.unpkg,
            format: 'umd',
        },
    }),
    createConfig({
        output: {
            file: pkg.unpkg.replace('dev', 'min'),
            format: 'umd',
        },
        min: true,
    }),
]
