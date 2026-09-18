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
  JoinClassDto,
  UpdateJoinStatusDto,
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

  @Post('join')
  @Roles(['student'])
  join(@Body() dto: JoinClassDto, @Req() req) {
    return this.classService.joinByCode(dto.code, req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.classService.findOne(id, req.user);
  }

  @Post(':id/join-code/regenerate')
  @Roles(['teacher'])
  regenerateJoinCode(@Param('id') id: string, @Req() req) {
    return this.classService.regenerateJoinCode(id, req.user);
  }

  @Patch(':id/join-status')
  @Roles(['teacher'])
  updateJoinStatus(
    @Param('id') id: string,
    @Body() dto: UpdateJoinStatusDto,
    @Req() req,
  ) {
    return this.classService.updateJoinStatus(id, dto.status, req.user);
  }

  @Patch(':id')
  @Roles(['teacher'])
  update(@Param('id') id: string, @Body() dto: UpdateClassDto, @Req() req) {
    return this.classService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles(['teacher', 'admin'])
  remove(@Param('id') id: string, @Req() req) {
    return this.classService.remove(id, req.user);
  }

  // --- Student Enrollment ---

  @Post(':id/students')
  @Roles(['teacher'])
  addStudents(@Param('id') id: string, @Body() dto: AddStudentsDto, @Req() req) {
    return this.classService.addStudents(id, dto.studentIds, req.user);
  }

  @Get(':id/students')
  @Roles(['teacher'])
  getStudents(@Param('id') id: string, @Query() query: StudentQuery, @Req() req) {
    return this.classService.getStudents(id, query, req.user);
  }

  @Delete(':id/students')
  @Roles(['teacher'])
  removeStudents(@Param('id') id: string, @Body() dto: AddStudentsDto, @Req() req) {
    return this.classService.removeStudents(id, dto.studentIds, req.user);
  }

  @Delete(':id/membership')
  @Roles(['student'])
  leave(@Param('id') id: string, @Req() req) {
    return this.classService.leave(id, req.user);
  }

  // --- Class Tasks (add/remove tasks from class, before scheduling) ---

  @Post(':id/tasks')
  @Roles(['teacher'])
  addTasks(@Param('id') id: string, @Body() dto: AddTasksDto, @Req() req) {
    return this.classService.addTasks(id, dto.taskIds, req.user);
  }

  @Get(':id/tasks')
  @Roles(['teacher'])
  getClassTasks(@Param('id') id: string, @Req() req) {
    return this.classService.getClassTasks(id, req.user);
  }

  @Delete(':id/tasks')
  @Roles(['teacher'])
  removeTasks(@Param('id') id: string, @Body() dto: RemoveTasksDto, @Req() req) {
    return this.classService.removeTasks(id, dto.taskIds, req.user);
  }

  // --- Scheduling (activate a ClassTask for students) ---

  @Post(':id/schedule')
  @Roles(['teacher'])
  scheduleTask(@Param('id') id: string, @Body() dto: ScheduleTaskDto, @Req() req) {
    return this.classService.scheduleTask(id, dto, req.user);
  }

  @Get(':id/scheduled-tasks')
  getScheduledTasks(@Param('id') id: string, @Req() req: any) {
    return this.classService.getScheduledTasks(id, req.user);
  }

  @Get(':id/scheduled-tasks/:scheduledTaskId/analytics')
  @Roles(['teacher'])
  getScheduledTaskAnalytics(
    @Param('id') id: string,
    @Param('scheduledTaskId') scheduledTaskId: string,
    @Req() req,
  ) {
    return this.classService.getScheduledTaskAnalytics(id, scheduledTaskId, req.user);
  }

  @Get(':id/students/progress')
  @Roles(['teacher'])
  async getClassStudentProgress(@Req() req, @Param('id') classId: string) {
    const teacherId = req.user.sub;

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
    @Req() req,
  ) {
    return this.classService.unscheduleTask(id, classTaskId, req.user);
  }
}
