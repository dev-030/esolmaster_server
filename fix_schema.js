const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const oldSchemaStr = `                    properties: {
                      options: { type: "array", items: { type: "string" } },
                      correctIndex: { type: "number" },
                      answer: { type: "string" }
                    },
                    required: ["options"],`;

const newSchemaStr = `                    properties: {
                      options: { type: "array", items: { type: "string" } },
                      correctIndex: { type: ["number", "null"] },
                      answer: { type: ["string", "null"] }
                    },
                    required: ["options", "correctIndex", "answer"],`;

code = code.replace(oldSchemaStr, newSchemaStr);

const oldSchemaStr2 = `                    properties: {
                      answer: { type: "string" }
                    },
                    additionalProperties: false`;

const newSchemaStr2 = `                    properties: {
                      answer: { type: ["string", "null"] }
                    },
                    required: ["answer"],
                    additionalProperties: false`;

code = code.replace(oldSchemaStr2, newSchemaStr2);

fs.writeFileSync(file, code);
console.log("Schema fixed!");
