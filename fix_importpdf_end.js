const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `    const match = responseText.match(/\`\`\`(?:json)?\\s*([\\s\\S]*?)\\s*\`\`\`/);
    if (match) responseText = match[1];
    return JSON.parse(responseText.trim());
  }
}`;

const newStr = `    const match = responseText.match(/\`\`\`(?:json)?\\s*([\\s\\S]*?)\\s*\`\`\`/);
    if (match) responseText = match[1];
    const parsed = JSON.parse(responseText.trim());

    // Backend Validation with Severity
    const validSectionsCount = parsed.sections ? parsed.sections.length : 0;
    const globalErrors: string[] = [];
    const globalWarnings: string[] = [];
    
    if (parsed.questions) {
      for (const q of parsed.questions) {
        q.validation = { errors: [], warnings: [], reviewRequired: [] };
        
        const validSectionIndices = parsed.sections ? parsed.sections.map((s: any) => s.sectionIndex) : [];
        if (typeof q.sectionIndex !== 'number' || !validSectionIndices.includes(q.sectionIndex)) {
          const msg = \`Invalid sectionIndex \${q.sectionIndex}\`;
          q.validation.errors.push(msg);
          globalErrors.push(msg);
        }
        
        if (q.type === 'MCQ') {
          if (!q.config || !q.config.options || q.config.options.length < 2) {
             const msg = "Invalid MCQ: Must have at least 2 options.";
             q.validation.errors.push(msg);
             globalErrors.push(msg);
          }
          if (q.config && typeof q.config.correctIndex === 'number') {
             if (q.config.correctIndex < 0 || q.config.correctIndex >= (q.config.options?.length || 0)) {
                 const msg = \`MCQ correctIndex out of bounds: \${q.config.correctIndex}\`;
                 q.validation.errors.push(msg);
                 globalErrors.push(msg);
             }
          }
        }
        
        if (q.answerState === 'UNKNOWN') {
           q.validation.reviewRequired.push("Answer is UNKNOWN. Teacher must solve.");
        }
        if (q.confidence === 'LOW') {
           q.validation.reviewRequired.push("Low confidence answer. Teacher review advised.");
        }
      }
    }
    
    parsed.validationReport = { errors: globalErrors, warnings: globalWarnings };

    // Process context regions via Cloudinary if available
    if (parsed.sections?.some((s: any) => s.contextRegions?.length > 0)) {
      console.log('Generating context crops via Cloudinary...');
      try {
        const tempPdf = await this.uploadService.uploadTemporaryPdf(file);
        const axios = require('axios');
        
        for (const section of parsed.sections) {
          if (section.contextRegions?.length > 0) {
            const r = section.contextRegions[0];
            section.validation = section.validation || { errors: [], warnings: [], reviewRequired: [] };
            
            if (r.page < 1) {
              section.validation.errors.push("Invalid page number.");
              globalErrors.push("Invalid page number for context crop.");
              continue;
            }
            if (r.x < 0 || r.y < 0 || r.width <= 0.01 || r.height <= 0.01 || r.x + r.width > 1.1 || r.y + r.height > 1.1) {
              section.validation.errors.push("Crop coordinates out of bounds or trivially small.");
              globalErrors.push("Crop coordinates out of bounds.");
              continue;
            }

            const cropUrl = this.uploadService.generateCropUrl(tempPdf.public_id, r.page, r.x, r.y, r.width, r.height);
            try {
              const response = await axios.get(cropUrl, { responseType: 'arraybuffer' });
              
              if (response.data.byteLength < 100) {
                 section.validation.errors.push("Generated crop image is suspiciously empty (too small).");
                 globalErrors.push("Empty crop generated.");
              } else {
                 const base64 = Buffer.from(response.data, 'binary').toString('base64');
                 section.imageUrl = \`data:image/png;base64,\${base64}\`;
                 section.validation.warnings.push("Context automatically cropped. Review boundaries.");
              }
            } catch (cropErr: any) {
              console.error("Failed to fetch crop from Cloudinary:", cropErr.message);
              section.validation.errors.push(\`Crop generation failed: \${cropErr.message}\`);
              globalErrors.push("Cloudinary crop generation failed.");
            }
          }
        }
        await this.uploadService.deleteFile(tempPdf.public_id);
      } catch (err) {
        console.error("Failed to generate context images:", err);
      }
    }

    const crypto = require('crypto');
    const uuidv4 = () => crypto.randomUUID();

    // Map sections
    const sectionsWithIds = (parsed.sections || []).map((s: any) => ({
      ...s,
      id: uuidv4(),
      content: s.content || "",
      imageUrl: s.imageUrl || ""
    }));

    // Map questions
    const questionsWithIds = (parsed.questions || []).map((q: any) => {
      const parentSection = sectionsWithIds.find((s: any) => s.sectionIndex === q.sectionIndex);
      const secId = parentSection ? parentSection.id : undefined;
      const { sectionIndex, ...rest } = q;
      return {
        ...rest,
        id: uuidv4(),
        sectionId: secId
      };
    });

    return {
      documentType: parsed.documentType || 'UNKNOWN',
      sections: sectionsWithIds,
      questions: questionsWithIds,
      validationReport: parsed.validationReport,
      metadata: typeof metadata !== 'undefined' ? metadata : {}
    };
  }
}`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, newStr);
  fs.writeFileSync(file, code);
  console.log("Success! Re-injected all logic and UUIDs.");
} else {
  console.log("Target string not found. File might be in weird state.");
}
