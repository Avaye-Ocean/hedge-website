'use strict';

const fs = require('fs');
const path = require('path');
const UglifyJS = require('uglify-js');

// Minify each browser entry into its .min.js sibling (loaded in production).
const files = ['main.js', 'hedge-fx.js'];

for (const name of files) {
  const inputPath = path.join(__dirname, '../public/js', name);
  const outputPath = inputPath.replace(/\.js$/, '.min.js');
  const source = fs.readFileSync(inputPath, 'utf8');
  const result = UglifyJS.minify(source, {
    compress: { drop_console: false },
    mangle: true,
  });
  if (result.error) {
    console.error(`Build failed for ${name}:`, result.error);
    process.exit(1);
  }
  fs.writeFileSync(outputPath, result.code, 'utf8');
  console.log(`Built ${path.basename(outputPath)} (${Buffer.byteLength(result.code, 'utf8')} bytes)`);
}
