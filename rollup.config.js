import babel from "rollup-plugin-babel";
import resolve from "rollup-plugin-node-resolve";
import replace from "rollup-plugin-replace";
import { uglify } from "rollup-plugin-uglify";

export default {
    entry: "src/main.js",
    dest: "build/sdk.js",
    format: "iife",
    moduleName: "abstraction_sdk",
    sourceMap: "inline",
    plugins: [
        babel(),
        resolve({
            jsnext: true,
            main: true,
            browser: true,
        }),
        replace({
            ENV: JSON.stringify(process.env.NODE_ENV || "development"),
        }),
        process.env.NODE_ENV === "production" && uglify(),
    ],
};
