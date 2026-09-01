const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const target = 'return JSON.parse(responseText.trim());';
const replace = `
    const parsed = JSON.parse(responseText.trim());
    const { v4: uuidv4 } = require('uuid');
    
    // Map sections
    const sectionsWithIds = (parsed.sections || []).map(s => ({
      ...s,
      id: uuidv4(),
      content: s.content || ""
    }));

    // Map questions
    const questionsWithIds = (parsed.questions || []).map(q => {
      const secId = sectionsWithIds[q.sectionIndex]?.id;
      const { sectionIndex, ...rest } = q;
      return {
        ...rest,
        id: uuidv4(),
        sectionId: secId
      };
    });

    return {
      sections: sectionsWithIds,
      questions: questionsWithIds
    };
`;

code = code.replace(target, replace);
fs.writeFileSync(file, code);
