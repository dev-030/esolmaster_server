const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `                    height: { type: "number", description: "Normalized 0-1" },
                    purpose: { type: "string", description: "e.g. Poster for Task 1" }
                  },
                  required: ["page", "x", "y", "width", "height", "purpose"],`;

const newStr = `                    height: { type: "number", description: "Normalized 0-1" },
                    purpose: { type: "string", description: "e.g. Poster for Task 1" },
                    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }
                  },
                  required: ["page", "x", "y", "width", "height", "purpose", "confidence"],`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("Schema patched!");
