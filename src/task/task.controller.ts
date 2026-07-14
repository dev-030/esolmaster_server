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
} from '@nestjs/common';
import { TaskService } from './task.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/decorator/role.decorator';
import { AddQuestionsDto, CreateTaskDto, TaskQueryDto } from './dto/task.dto';
import { RolesGuard } from 'src/guards/role.guard';
import {
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
  @Roles(['admin', 'teacher'])
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 10 },
      { name: 'passageImage', maxCount: 1 },
    ]),
  )
  async create(
    @Body() createTaskDto: CreateTaskDto,
    @Req() req: any,
    @UploadedFiles()
    files?: {
      images?: Express.Multer.File[];
      passageImage?: Express.Multer.File[];
    },
  ) {
    const userId = req.user.sub;
    const status = req.user.role === 'admin' ? 'APPROVED' : 'PENDING_APPROVAL';

    return this.taskService.createTask(
      createTaskDto,
      userId,
      status,
      req.user.role,
      files?.images,
      files?.passageImage?.[0], // single file
    );
  }

  @Patch(':id')
  @Roles(['admin', 'teacher'])
  @UseInterceptors(AnyFilesInterceptor())
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

  @Post(':taskId/questions')
  @Roles(['admin', 'teacher'])
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
  async getAllScheduledTasks(
    @Req() req: any,
    @Query() pagination: PaginationQueryDto,
  ) {
    console.log('hit the api', req.user.sub);
    return await this.taskService.getAllScheduledTasks(req.user, pagination);
  }

  @Patch(':id/approve')
  @Roles(['admin'])
  async approveTask(@Param('id') id: string, @Req() req) {
    console.log('User attempting to approve task:', req.user.role); // Debugging line to check user info
    console.log('Approving task with ID:', id); // Debugging line
    return this.taskService.updateStatus(id, 'APPROVED');
  }

  @Patch(':id/reject')
  @Roles(['admin'])
  async rejectTask(@Param('id') id: string) {
    return this.taskService.updateStatus(id, 'REJECTED');
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.taskService.findOne(id);
  }
}
