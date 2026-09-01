const fs = require('fs');
const file = 'src/task/openai.service.ts';
let code = fs.readFileSync(file, 'utf8');

const newSchema = `const esolSchema = {
      type: "object",
      properties: {
        documentType: { type: "string", enum: ["CANDIDATE_PAPER", "TUTOR_COPY", "ASSESSOR_PACK", "SAMPLE_PAPER", "PRACTICE_PAPER", "UNKNOWN"] },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sectionIndex: { type: "number" },
              title: { type: "string", description: "e.g. Task 1" },
              instruction: { type: "string" },
              contextRegions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    page: { type: "number", description: "1-indexed page number" },
                    x: { type: "number", description: "Normalized 0-1" },
                    y: { type: "number", description: "Normalized 0-1" },
                    width: { type: "number", description: "Normalized 0-1" },
                    height: { type: "number", description: "Normalized 0-1" },
                    purpose: { type: "string", description: "e.g. Poster for Task 1" }
                  },
                  required: ["page", "x", "y", "width", "height", "purpose"],
                  additionalProperties: false
                }
              }
            },
            required: ["sectionIndex", "title", "instruction", "contextRegions"],
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
                  sectionIndex: { type: "number" },
                  type: { type: "string", enum: ["MCQ", "TRUE_FALSE", "GAP_FILL"] },
                  content: { type: "string" },
                  marks: { type: "number" },
                  answerState: { type: "string", enum: ["PRINTED", "AI_SOLVED", "TEACHER_PROVIDED", "VERIFIED", "CONFLICT", "UNKNOWN"] },
                  confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                  evidence: { type: "string" },
                  config: {
                    type: "object",
                    properties: {
                      options: { type: "array", items: { type: "string" } },
                      correctIndex: { type: "number" },
                      answer: { type: "string" }
                    },
                    required: ["options"],
                    additionalProperties: false
                  }
                },
                required: ["sectionIndex", "type", "content", "marks", "answerState", "confidence", "evidence", "config"],
                additionalProperties: false
              },
              {
                type: "object",
                properties: {
                  sectionIndex: { type: "number" },
                  type: { type: "string", enum: ["QUESTION_ANSWER", "INSTRUCTION"] },
                  content: { type: "string" },
                  marks: { type: "number" },
                  answerState: { type: "string", enum: ["PRINTED", "AI_SOLVED", "TEACHER_PROVIDED", "VERIFIED", "CONFLICT", "UNKNOWN"] },
                  confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                  evidence: { type: "string" },
                  config: {
                    type: "object",
                    properties: {
                      answer: { type: "string" }
                    },
                    additionalProperties: false
                  }
                },
                required: ["sectionIndex", "type", "content", "marks", "answerState", "confidence", "evidence"],
                additionalProperties: false
              }
            ]
          }
        }
      },
      required: ["documentType", "sections", "questions"],
      additionalProperties: false
    };`;

code = code.replace(/const esolSchema = \{[\s\S]*?additionalProperties: false\n    \};/, newSchema);
fs.writeFileSync(file, code);
console.log("Schema patched!");
