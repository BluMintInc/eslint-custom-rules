const fs = require('fs');
const path = require('path');

const indexPath = path.join('src', 'index.ts');
const packageJson = require('../package.json');

let content = fs.readFileSync(indexPath, 'utf8');
content = content.replace(
  /version: '[^']+'/, 
  `version: '${packageJson.version}'`
);
fs.writeFileSync(indexPath, content); 