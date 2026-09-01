const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `    // Map sections
    const sectionsWithIds = (parsed.sections || []).map(s => ({
      ...s,
      id: uuidv4(),
      content: s.content || ""
    }));`;

const newStr = `    // Process context regions via Cloudinary if available
    if (parsed.sections?.some(s => s.contextRegions?.length > 0)) {
      console.log('Generating context crops via Cloudinary...');
      try {
        const tempPdf = await this.uploadService.uploadTemporaryPdf(file);
        const axios = require('axios');
        
        for (const section of parsed.sections) {
          if (section.contextRegions?.length > 0) {
            const r = section.contextRegions[0];
            // Validate bounds
            if (r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= 1.05 && r.y + r.height <= 1.05) {
              const cropUrl = this.uploadService.generateCropUrl(tempPdf.public_id, r.page, r.x, r.y, r.width, r.height);
              try {
                const response = await axios.get(cropUrl, { responseType: 'arraybuffer' });
                const base64 = Buffer.from(response.data, 'binary').toString('base64');
                section.imageUrl = \`data:image/png;base64,\${base64}\`;
              } catch (cropErr) {
                console.error("Failed to fetch crop from Cloudinary:", cropErr.message);
              }
            }
          }
        }
        await this.uploadService.deleteFile(tempPdf.public_id);
      } catch (err) {
        console.error("Failed to generate context images:", err);
      }
    }

    // Map sections
    const sectionsWithIds = (parsed.sections || []).map(s => ({
      ...s,
      id: uuidv4(),
      content: s.content || "",
      imageUrl: s.imageUrl || ""
    }));`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("importPdf patched!");
