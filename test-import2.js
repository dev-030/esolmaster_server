const fs = require('fs');
const pdfParse = require('pdf-parse');

console.log(typeof pdfParse);
if (typeof pdfParse !== 'function') {
  console.log(pdfParse);
}
