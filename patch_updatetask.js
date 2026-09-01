const fs = require('fs');
const file = 'src/task/task.service.ts';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `  async updateTask(
    taskId: string,
    dto: UpdateTaskDto,
    userId: string,
    role: string,
    files?: Express.Multer.File[],
    passageImage?: Express.Multer.File,
  ) {`;

const newStr = `  async updateTask(
    taskId: string,
    dto: UpdateTaskDto,
    userId: string,
    role: string,
    files?: Express.Multer.File[],
    passageImage?: Express.Multer.File,
  ) {
    // Process base64 temporary context images in content
    if (dto.content && typeof dto.content === 'string' && dto.content.includes('data:image/')) {
      try {
        const parsedContent = JSON.parse(dto.content);
        if (parsedContent.sections) {
          for (const section of parsedContent.sections) {
            if (section.imageUrl && section.imageUrl.startsWith('data:image/')) {
              const base64Data = section.imageUrl.replace(/^data:image\\/\\w+;base64,/, "");
              const buffer = Buffer.from(base64Data, 'base64');
              const dummyFile = {
                buffer,
                originalname: 'context_image.png',
                mimetype: 'image/png',
                size: buffer.length
              } as Express.Multer.File;
              section.imageUrl = await this.uploadService.uploadSingleImage(dummyFile, 'task_images');
            }
          }
          dto.content = JSON.stringify(parsedContent);
        }
      } catch (err) {
        console.error("Failed to process base64 images in updateTask", err);
      }
    }`;

code = code.replace(targetStr, newStr);
fs.writeFileSync(file, code);
console.log("updateTask patched!");
