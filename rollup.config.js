import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import replace from '@rollup/plugin-replace';

const isProd = process.env.NODE_ENV === 'production';

const banner = `/*!
 * @muffin/atom-websdk v${process.env.npm_package_version}
 * Footloose Labs — ${new Date().getFullYear()}
 * Includes @muffin/element
 */`;

const plugins = [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    replace({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        preventAssignment: true
    })
];

export default [
    // IIFE — CDN / script tag
    // Bundles @muffin/element + atom-websdk into one file.
    // This is what gets deployed to the CDN. Same artifact as before.
    {
        input: 'src/main.js',
        output: {
            file: 'dist/sdk.min.js',
            format: 'iife',
            banner,
            sourcemap: isProd ? false : 'inline'
        },
        plugins: [...plugins, isProd && terser()].filter(Boolean)
    },

    // ESM — for bundler use (Vite projects that import the SDK as a module)
    // @muffin/element is marked external — consumer controls that dependency.
    {
        input: 'src/main.js',
        external: ['@muffin/element'],
        output: {
            file: 'dist/sdk.esm.js',
            format: 'esm',
            banner
        },
        plugins: [...plugins, isProd && terser()].filter(Boolean)
    }
];
