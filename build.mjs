// build.mjs
import esbuild from "esbuild";

// Configure esbuild to bundle your TypeScript files
esbuild
  .build({
    entryPoints: ["scrap.ts"], // Replace with your main entry file
    outfile: "dist/bundle.js", // Output bundled file
    bundle: true, // Enable bundling
    platform: "node", // Platform can be 'node' or 'browser' depending on your target
    sourcemap: true, // Generate source maps
    minify: true, // Minify the output
    target: ["esnext"], // Define the JavaScript version target
    format: "cjs", // Output format: 'cjs' (CommonJS) or 'esm' (ES Modules)
  })
  .catch(() => process.exit(1));
