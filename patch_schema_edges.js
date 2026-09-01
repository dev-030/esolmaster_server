const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `                    x: { type: "number", description: "Normalized 0-1" },
                    y: { type: "number", description: "Normalized 0-1" },
                    width: { type: "number", description: "Normalized 0-1" },
                    height: { type: "number", description: "Normalized 0-1" },`;

const newStr = `                    left: { type: "number", description: "Normalized 0-1 left edge" },
                    top: { type: "number", description: "Normalized 0-1 top edge" },
                    right: { type: "number", description: "Normalized 0-1 right edge" },
                    bottom: { type: "number", description: "Normalized 0-1 bottom edge" },`;

code = code.replace(targetStr, newStr);

code = code.replace(`"page", "x", "y", "width", "height", "purpose", "confidence"`, `"page", "left", "top", "right", "bottom", "purpose", "confidence"`);

fs.writeFileSync(file, code);
