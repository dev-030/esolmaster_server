import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorator/role.decorator';
import { AdminUsersQueryDto } from './dto/admin.dto';
import type { Response } from 'express';

@Controller('admin')
@UseGuards(AuthGuard('jwt'),RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}
    @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  getUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.getAllUsers(query);
  }

  @Get('users/:id')
  getUserInfo(@Param('id') userId: string) {
    return this.adminService.getUserInfo(userId);
  }

  @Get('performance')
  exportPerformanceData() {
    return this.adminService.getPerformance();
  }

  @Get('performance/export')
async exportPerformance(@Res() res: Response) {
  const csv = await this.adminService.exportPerformanceData();

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="performance-data.csv"',
  );

  return res.send(csv);
}

@Get('analytics/platform')
getPlatformAnalytics() {
  return this.adminService.getPlatformAnalytics();
}

@Get('reports/export')
@Roles(['admin'])
async exportReport(@Query('type') type: string, @Res() res: Response) {
  const csv = await this.adminService.exportReport(type);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${type}.csv"`,
  );

  return res.send(csv);
}

}
