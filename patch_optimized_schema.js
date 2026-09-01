const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const schemaStr = `const esolSchema = {
      type: "object",
      properties: {
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Task name e.g. Task 1" },
              instruction: { type: "string" }
            },
            required: ["title", "instruction"],
            additionalProperties: false
          }
        },
        questions: {
          type: "array",
          items: {
            anyOf: [
              {
                type: "object",
                properties: {
                  sectionIndex: { type: "number", description: "0-indexed section array index" },
                  type: { type: "string", enum: ["MCQ", "TRUE_FALSE", "GAP_FILL"] },
                  content: { type: "string" },
                  marks: { type: "number" },
                  config: {
                    type: "object",
                    properties: {
                      options: { type: "array", items: { type: "string" } },
                      correctIndex: { type: "number" }
                    },
                    required: ["options", "correctIndex"],
                    additionalProperties: false
                  }
                },
                required: ["sectionIndex", "type", "content", "marks", "config"],
                additionalProperties: false
              },
              {
                type: "object",
                properties: {
                  sectionIndex: { type: "number", description: "0-indexed section array index" },
                  type: { type: "string", enum: ["QUESTION_ANSWER"] },
                  content: { type: "string" },
                  marks: { type: "number" }
                },
                required: ["sectionIndex", "type", "content", "marks"],
                additionalProperties: false
              }
            ]
          }
        }
      },
      required: ["sections", "questions"],
      additionalProperties: false
    };`;

const startIndex = code.indexOf('const esolSchema = {');
const endIndex = code.indexOf('const responseStream = await this.openai.responses.create');

if (startIndex !== -1 && endIndex !== -1) {
  code = code.substring(0, startIndex) + schemaStr + '\n\n    ' + code.substring(endIndex);
  fs.writeFileSync(file, code);
  console.log("Schema optimized patched");
} else {
  console.log("Could not find schema");
}
