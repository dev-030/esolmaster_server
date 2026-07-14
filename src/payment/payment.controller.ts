import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/guards/role.guard';
import { Roles } from 'src/decorator/role.decorator';
import {
  AttachPremiumTasksDto,
  CreateCheckoutSessionDto,
  CreatePlanDto,
  UpdatePlanDto,
} from './dto/payment.dto';
import { Role } from 'src/database/prisma-client/enums';

@Controller('stripe')
export class PaymentWebhookController {
  constructor(
    private readonly paymentService: PaymentService,
  ) {}

  @Post('webhook')
  handleStripeWebhook(
    @Req() req,
    @Headers('stripe-signature')
    signature: string,
  ) {
    return this.paymentService.handleStripeWebhook(
      req.rawBody,
      signature,
    );
  }
}

@Controller('payment')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
  ) {}

  @Get('plans')
  @Roles(['teacher', 'admin'])
  getSubscriptionPlans() {
    return this.paymentService.getSubscriptionPlans();
  }

  @Post('checkout')
  @Roles([Role.teacher])
  createCheckoutSession(
    @Req() req,
    @Body() planDto: CreateCheckoutSessionDto,
  ) {
    const userId = req.user.sub;

    return this.paymentService.createCheckoutSession(
      userId,
      planDto,
    );
  }

  @Get('me')
  getMySubscription(@Req() req) {
    const userId = req.user.sub;

    return this.paymentService.getMySubscription(
      userId,
    );
  }

  @Get('billing-info')
  getBillingInfo(@Req() req) {
    const userId = req.user.sub;

    return this.paymentService.getBillingInfo(
      userId,
    );
  }
  /// Admin routes///
  @Get('admin/billing/overview')
  @Roles([Role.admin])
  getAdminBillingOverview() {
    return this.paymentService.getAdminBillingOverview();
  }

  @Get('admin/billing/subscribers')
  @Roles([Role.admin])
  getAdminSubscribers(
    @Query() query,
  ) {
    return this.paymentService.getAdminSubscribers(
      query,
    );
  }

  @Patch(
    'admin/billing/users/:userId/change-plan',
  )
  @Roles([Role.admin])
  changeUserPlan(
    @Req() req,
    @Param('userId')
    userId: string,
    @Body() body,
  ) {
    return this.paymentService.adminChangeUserPlan(
      userId,
      req.user.sub,
      body,
    );
  }

  @Patch(
    'admin/billing/users/:userId/cancel',
  )
  @Roles([Role.admin])
  cancelUserSubscription(
    @Req() req,
    @Param('userId')
    userId: string,
  ) {
    return this.paymentService.adminCancelUserSubscription(
      userId,
      req.user.sub,
    );
  }

  /// Admin: package (plan) management + Stripe sync ///

  @Get('admin/plans')
  @Roles([Role.admin])
  listAdminPlans() {
    return this.paymentService.listAdminPlans();
  }

  @Post('admin/plans')
  @Roles([Role.admin])
  createPlan(@Body() dto: CreatePlanDto) {
    return this.paymentService.createPlan(dto);
  }

  @Patch('admin/plans/:planId')
  @Roles([Role.admin])
  updatePlan(@Param('planId') planId: string, @Body() dto: UpdatePlanDto) {
    return this.paymentService.updatePlan(planId, dto);
  }

  @Get('admin/plans/:planId/premium-tasks')
  @Roles([Role.admin])
  getPlanPremiumTasks(@Param('planId') planId: string) {
    return this.paymentService.getPlanPremiumTasks(planId);
  }

  @Post('admin/plans/:planId/premium-tasks')
  @Roles([Role.admin])
  attachPremiumTasks(
    @Param('planId') planId: string,
    @Body() dto: AttachPremiumTasksDto,
  ) {
    return this.paymentService.attachPremiumTasks(planId, dto);
  }

  @Patch('admin/plans/:planId/premium-tasks/:taskId/detach')
  @Roles([Role.admin])
  detachPremiumTask(
    @Param('planId') planId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.paymentService.detachPremiumTask(planId, taskId);
  }
}