// guard.module.ts
import { Module } from "@nestjs/common";
import { GoogleRoleGuard } from "./google-role.guard";
import { RolesGuard } from "./role.guard";

@Module({
  providers: [GoogleRoleGuard,RolesGuard],
  exports: [GoogleRoleGuard,RolesGuard], // Export it so AuthModule can see it
})
export class GuardModule {}