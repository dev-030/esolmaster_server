import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { TeacherStudentsProgressQueryDto } from './dto/anaylytics.dto';
import { AuthGuard } from '@nestjs/passport/dist/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorator/role.decorator';

const teacher = 'teacher';

@Controller('analytics')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}
  @Roles(['teacher'])
  @Get(`${teacher}/students`)
  async getAllStudentsProgress(
    @Req() req,
    @Query() query: TeacherStudentsProgressQueryDto,
  ) {
    const teacherId = req.user.sub;

    return this.analyticsService.getAllStudentsProgress(teacherId, query);
  }

  @Get('students/:studentId')
  getStudentPerformanceDetails(
    @Req() req,
    @Param('studentId') studentId: string,
  ) {
    return this.analyticsService.getStudentPerformanceDetails(
      req.user.sub,
      studentId,
    );
  }

  @Get('reports')
  getReportsOverview(@Req() req) {
    return this.analyticsService.getReportsOverview(req.user.sub);
  }

  @Get(`${teacher}/summary`)
  getTeacherAnalyticsSummary(@Req() req) {
    return this.analyticsService.getTeacherAnalyticsSummary(req.user.sub);
  }
}
