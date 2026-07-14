import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { StudentService } from './student.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorator/role.decorator';
import { ScheduledTaskQueryDto } from './dto/student..dto';

@Controller('student')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(['student'])
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get('dashboard')
  async getDashboard(@Req() req) {
    return this.studentService.getDashboard(req.user.sub);
  }

  @Get('progress')
  async getProgress(@Req() req) {
    return this.studentService.getProgress(req.user.sub);
  }

  @Get('activity')
  async getActivity(@Req() req) {
    return this.studentService.getRecentActivity(req.user.sub);
  }

  @Get('score-trend')
  async getScoreTrend(@Req() req) {
    return this.studentService.getScoreTrend(req.user.sub);
  }

  @Get('scheduled-tasks')
  async getScheduledTasks(@Req() req,@Query() query: ScheduledTaskQueryDto) {
    return this.studentService.getScheduledTasks(req.user.sub, query);
  }
  @Get('skill-distribution')
  async getSkillDistribution(@Req() req) {
    return this.studentService.getSkillDistribution(req.user.sub);
  }
}