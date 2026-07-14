import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AttemptService } from './attempt.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/decorator/role.decorator';
import { SubmitAnswerDto } from './dto/attempt.dto';
import { RolesGuard } from 'src/guards/role.guard';

@Controller('attempts')
@UseGuards(AuthGuard('jwt'),RolesGuard)
export class AttemptController {
  constructor(private readonly attemptService: AttemptService) {}

  // 1. Start or Resume an Attempt
  @Post('start')
  @Roles(['student'])
  startAttempt(@Body() dto: { scheduledTaskId: string }, @Req() req) {
    return this.attemptService.startOrResumeAttempt(req.user.sub, dto.scheduledTaskId);
  }

  // 2. Get current state (used for frontend to re-hydrate UI)
  @Get(':id')
  @Roles(['student'])
  getAttempt(@Param('id') id: string, @Req() req) {
    return this.attemptService.getAttemptState(id, req.user.sub);
  }

  // 3. Submit an answer (The Judging Engine)
  @Post(':id/answer')
  @Roles(['student'])
  submitAnswer(@Param('id') id: string, @Body() dto: SubmitAnswerDto, @Req() req) {
    return this.attemptService.processAnswer(id, req.user.sub, dto);
  }
}