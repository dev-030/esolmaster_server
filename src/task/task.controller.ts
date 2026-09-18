import {
  Controller,
  UseGuards,
  Post,
  Body,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  Delete,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/decorator/role.decorator';
import { AddQuestionsDto, CreateTaskDto, TaskQueryDto } from './dto/task.dto';
import { RolesGuard } from 'src/guards/role.guard';
import {
  FileInterceptor,
  AnyFilesInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import { UpdateTaskDto } from './dto/update-task.dto';
import { PaginationQueryDto } from 'common/dto/pagination.dto';

@Controller('tasks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @Roles(['admin'])
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'images', maxCount: 10 },
        { name: 'passageImage', maxCount: 1 },
        { name: 'sectionImages', maxCount: 20 },
      ],
      { limits: { fileSize: 8 * 1024 * 1024, files: 31 } },
    ),
  )
  async create(
    @Body() createTaskDto: CreateTaskDto,
    @Req() req: any,
    @UploadedFiles()
    files?: {
      images?: Express.Multer.File[];
      passageImage?: Express.Multer.File[];
      sectionImages?: Express.Multer.File[];
    },
  ) {
    const userId = req.user.sub;
    const status = createTaskDto.status === 'DRAFT' ? 'DRAFT' : 'APPROVED';

    return this.taskService.createTask(
      createTaskDto,
      userId,
      status,
      req.user.role,
      files?.images,
      files?.passageImage?.[0], // single file
      files?.sectionImages,
    );
  }

  @Patch(':id')
  @Roles(['admin'])
  @UseInterceptors(
    AnyFilesInterceptor({ limits: { fileSize: 8 * 1024 * 1024, files: 31 } }),
  )
  async update(
    @Param('id') taskId: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @Req() req: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.taskService.updateTask(
      taskId,
      updateTaskDto,
      req.user.sub,
      req.user.role,
      files || [],
    );
  }


  @Post('import-pdf')
  @Roles(['admin'])
  @UseInterceptors(FileInterceptor('file'))
  async importPdf(@UploadedFile() file: Express.Multer.File) {
    return this.taskService.importPdf(file);
  }

  @Post(':taskId/questions')
  @Roles(['admin'])
  async addQuestions(
    @Param('taskId') taskId: string,
    @Body() questions: AddQuestionsDto,
  ) {
    return this.taskService.addQuestionsToTask(taskId, questions);
  }

  @Get(':taskId/words')
  @Roles(['admin', 'teacher'])
  async getWords(
    @Param('taskId') taskId: string,
    @Query('search') search?: string,
  ) {
    return this.taskService.getTasksWords(taskId, search);
  }

  @Get()
  @Roles(['admin', 'teacher'])
  async findAll(@Query() query: TaskQueryDto, @Req() req) {
    return this.taskService.findAll(req.user.role, req.user.sub, query);
  }

  @Get('scheduled')
  @Roles(['teacher', 'student'])
  async getAllScheduledTasks(
    @Req() req: any,
    @Query() pagination: PaginationQueryDto,
  ) {
    return await this.taskService.getAllScheduledTasks(req.user, pagination);
  }

  @Patch(':id/approve')
  @Roles(['admin'])
  async approveTask(@Param('id') id: string) {
    return this.taskService.updateStatus(id, 'APPROVED');
  }

  @Patch(':id/reject')
  @Roles(['admin'])
  async rejectTask(@Param('id') id: string) {
    return this.taskService.updateStatus(id, 'REJECTED');
  }

  @Get(':id')
  @Roles(['admin', 'teacher'])
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.taskService.findOne(id, req.user);
  }

  @Delete(':id')
  @Roles(['admin'])
  async remove(@Param('id') id: string, @Req() req) {
    return this.taskService.deleteTask(id, req.user);
  }
}
