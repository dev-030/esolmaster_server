const fs = require('fs');
const file = 'src/upload/upload.service.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `{ crop: 'crop', x, y, width: w, height: h, flags: 'relative' }`;
const newStr = `{ crop: 'crop', gravity: 'north_west', x, y, width: w, height: h, flags: 'relative' }`;

if (code.includes(target)) {
  code = code.replace(target, newStr);
  fs.writeFileSync(file, code);
  console.log("Patched upload.service.ts with gravity: north_west!");
} else {
  console.log("Target not found or already patched.");
}
