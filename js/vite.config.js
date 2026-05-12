import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, "src/index.js"),
            name: "mindzoo",
            fileName: "mindzoo",
        },
        sourcemap: "inline",
        minify: false,
        terserOptions: { compress: false, mangle: false },
        rollupOptions: {
            output: {
                codeSplitting: false,
            },
        },
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src/"),
            path: "path-browserify",
        },
    },
    define: {
        "process.env.NODE_ENV": '"production"',
    },
    test: {
        include: ["./src/**/*.test.js"],
        coverage: {
            provider: "istanbul",
            coverage: {
                reporter: ["text", "json", "html"],
            },
        },
    },
});
