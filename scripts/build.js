'use strict';

const fs = require('fs');
const path = require('path');
const UglifyJS = require('uglify-js');

const inputPath = path.join(__dirname, '../public/js/main.js');
const outputPath = path.join(__dirname, '../public/js/main.min.js');

const source = fs.readFileSync(inputPath, 'utf8');

const result = UglifyJS.minify(source, {
  compress: { drop_console: false },
  mangle: true,
});

if (result.error) {
  console.error('Build failed:', result.error);
  process.exit(1);
}

fs.writeFileSync(outputPath, result.code, 'utf8');
console.log(`Built main.min.js (${Buffer.byteLength(result.code, 'utf8')} bytes)`);
