import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { BadgeService } from './badge.service';
import { CreateBadgeDto } from './dto/badge.dto';
import { Roles } from 'src/decorator/role.decorator';
import { AuthGuard } from '@nestjs/passport/dist/auth.guard';
import { RolesGuard } from 'src/guards/role.guard';

@Controller('badge')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(['admin'])
export class BadgeController {
  constructor(private readonly badgeService: BadgeService) {}
   @Post()
  createBadge(@Body() dto: CreateBadgeDto) {
    return this.badgeService.createBadge(dto);
  }

  @Get()
  @Roles(['admin', 'student'])
  getBadges() {
    return this.badgeService.getBadges();
  }

  @Get('my-badges')
@Roles(['student'])
getMyBadges(@Req() req) {
  return this.badgeService.getMyBadges(req.user.sub);
}

  

  @Get(':id')
  getBadgeById(@Param('id') id: string) {
    return this.badgeService.getBadgeById(id);
  }

  @Patch(':id')
  updateBadge(@Param('id') id: string, @Body() dto: Partial<CreateBadgeDto>) {
    return this.badgeService.updateBadge(id, dto);
  }

  @Delete(':id')
  deleteBadge(@Param('id') id: string) {
    return this.badgeService.deleteBadge(id);
  }
}
