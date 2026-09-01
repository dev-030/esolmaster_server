const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `            const width = right - left;
            const height = bottom - top;

            if (left < 0 || top < 0 || right > 1 || bottom > 1 || left >= right || top >= bottom) {
              section.validation.errors.push("Crop coordinates out of bounds or invalid.");
              globalErrors.push("Crop coordinates out of bounds.");
              continue;
            }
            if (r.confidence === 'LOW' || r.confidence === 'MEDIUM') {
              section.validation.reviewRequired.push(\`Context crop confidence is \${r.confidence}. Please review boundaries.\`);
            }

            const cropUrl = this.uploadService.generateCropUrl(tempPdf.public_id, r.page, left, top, width, height);`;

const newStr = `            const width = Number((right - left).toFixed(4));
            const height = Number((bottom - top).toFixed(4));

            // Enrich the contextRegion object with full explicit and derived coordinate properties
            r.left = left;
            r.top = top;
            r.right = right;
            r.bottom = bottom;
            r.width = width;
            r.height = height;
            r.derivedWidth = width;
            r.derivedHeight = height;

            console.log(\`\\n======================================================\`);
            console.log(\`📐 [CONTEXT CROP COORDINATES] Section: "\${section.title || ('Task ' + section.sectionIndex)}" (Page \${r.page})\`);
            console.log(\`   • Edges:      { left: \${left}, top: \${top}, right: \${right}, bottom: \${bottom} }\`);
            console.log(\`   • Dimensions: { width: \${width}, height: \${height} }\`);
            console.log(\`   • Purpose:    "\${r.purpose || 'N/A'}" (Confidence: \${r.confidence || 'HIGH'})\`);
            console.log(\`======================================================\`);

            if (left < 0 || top < 0 || right > 1 || bottom > 1 || left >= right || top >= bottom) {
              section.validation.errors.push("Crop coordinates out of bounds or invalid.");
              globalErrors.push("Crop coordinates out of bounds.");
              console.warn(\`⚠️ [Crop Warning] Coordinates out of bounds for section "\${section.title}"\`);
              continue;
            }
            if (r.confidence === 'LOW' || r.confidence === 'MEDIUM') {
              section.validation.reviewRequired.push(\`Context crop confidence is \${r.confidence}. Please review boundaries.\`);
            }

            const cropUrl = this.uploadService.generateCropUrl(tempPdf.public_id, r.page, left, top, width, height);
            console.log(\`   • Cloudinary Crop URL: \${cropUrl}\`);`;

if (!code.includes(target)) {
  console.error("Target snippet not found in task.service.ts");
  process.exit(1);
}

code = code.replace(target, newStr);

// Also add a summary print right before return
const returnTarget = `    return {
      documentType: parsed.documentType || 'UNKNOWN',
      sections: sectionsWithIds,
      questions: questionsWithIds,
      validationReport: parsed.validationReport,
      metadata: typeof metadata !== 'undefined' ? metadata : {}
    };`;

const returnNew = `    console.log(\`\\n📋 --- IMPORT PDF SUMMARY ---\`);
    console.log(\`   Document Type: \${parsed.documentType || 'UNKNOWN'}\`);
    console.log(\`   Sections Extracted: \${sectionsWithIds.length}\`);
    console.log(\`   Questions Extracted: \${questionsWithIds.length}\`);
    sectionsWithIds.forEach((s: any, idx: number) => {
      if (s.contextRegions && s.contextRegions.length > 0) {
        const cr = s.contextRegions[0];
        console.log(\`   [Section \${idx + 1}: \${s.title}] Crop => Page: \${cr.page}, left: \${cr.left}, top: \${cr.top}, right: \${cr.right}, bottom: \${cr.bottom}, w: \${cr.width}, h: \${cr.height}\`);
      } else {
        console.log(\`   [Section \${idx + 1}: \${s.title}] No visual context region.\`);
      }
    });
    console.log(\`--------------------------------\\n\`);

    return {
      documentType: parsed.documentType || 'UNKNOWN',
      sections: sectionsWithIds,
      questions: questionsWithIds,
      validationReport: parsed.validationReport,
      metadata: typeof metadata !== 'undefined' ? metadata : {}
    };`;

code = code.replace(returnTarget, returnNew);
fs.writeFileSync(file, code);
console.log("Updated task.service.ts with coordinate logging and enrichment!");
