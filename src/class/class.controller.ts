import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { ClassService } from './class.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/decorator/role.decorator';
import { RolesGuard } from 'src/guards/role.guard';
import { PaginationQueryDto } from 'common/dto/pagination.dto';
import {
  AddStudentsDto,
  AddTasksDto,
  CreateClassDto,
  RemoveTasksDto,
  ScheduleTaskDto,
  StudentQuery,
  UpdateClassDto,
} from './dto/create.dto';

@Controller('classes')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ClassController {
  constructor(private readonly classService: ClassService) {}

  // --- Class CRUD ---

  @Post()
  @Roles(['teacher'])
  create(@Body() dto: CreateClassDto, @Req() req) {
    return this.classService.create(dto, req.user.sub);
  }

  @Get()
  findAll(@Req() req, @Query() query: PaginationQueryDto) {
    return this.classService.findAll(req.user.sub, req.user.role, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.classService.findOne(id);
  }

  @Patch(':id')
  @Roles(['teacher'])
  update(@Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.classService.update(id, dto);
  }

  @Delete(':id')
  @Roles(['teacher', 'admin'])
  remove(@Param('id') id: string) {
    return this.classService.remove(id);
  }

  // --- Student Enrollment ---

  @Post(':id/students')
  @Roles(['teacher'])
  addStudents(@Param('id') id: string, @Body() dto: AddStudentsDto) {
    return this.classService.addStudents(id, dto.studentIds);
  }

  @Get(':id/students')
  getStudents(@Param('id') id: string, @Query() query: StudentQuery) {
    return this.classService.getStudents(id, query);
  }

  @Delete(':id/students')
  removeStudents(@Param('id') id: string, @Body() dto: AddStudentsDto) {
    return this.classService.removeStudents(id, dto.studentIds);
  }

  // --- Class Tasks (add/remove tasks from class, before scheduling) ---

  @Post(':id/tasks')
  @Roles(['teacher'])
  addTasks(@Param('id') id: string, @Body() dto: AddTasksDto) {
    return this.classService.addTasks(id, dto.taskIds);
  }

  @Get(':id/tasks')
  @Roles(['teacher'])
  getClassTasks(@Param('id') id: string) {
    return this.classService.getClassTasks(id);
  }

  @Delete(':id/tasks')
  @Roles(['teacher'])
  removeTasks(@Param('id') id: string, @Body() dto: RemoveTasksDto) {
    return this.classService.removeTasks(id, dto.taskIds);
  }

  // --- Scheduling (activate a ClassTask for students) ---

  @Post(':id/schedule')
  @Roles(['teacher'])
  scheduleTask(@Param('id') id: string, @Body() dto: ScheduleTaskDto) {
    return this.classService.scheduleTask(id, dto);
  }

  @Get(':id/scheduled-tasks')
  getScheduledTasks(@Param('id') id: string, @Req() req: any) {
    console.log('Getting scheduled tasks for class', id, 'and user', req.user);
    return this.classService.getScheduledTasks(id, req.user);
  }

  @Get(':id/scheduled-tasks/:scheduledTaskId/analytics')
  @Roles(['teacher'])
  getScheduledTaskAnalytics(
    @Param('id') id: string,
    @Param('scheduledTaskId') scheduledTaskId: string,
  ) {
    return this.classService.getScheduledTaskAnalytics(id, scheduledTaskId);
  }

    @Get(':id/students/progress')
  async getClassStudentProgress(@Req() req, @Param('id') classId: string) {
    const teacherId = req.user.id;

    return this.classService.getClassStudentProgress(
      teacherId,
      classId,
    );
  }

  @Delete(':id/schedule/:classTaskId')
  @Roles(['teacher'])
  unscheduleTask(
    @Param('id') id: string,
    @Param('classTaskId') classTaskId: string,
  ) {
    return this.classService.unscheduleTask(id, classTaskId);
  }
}
