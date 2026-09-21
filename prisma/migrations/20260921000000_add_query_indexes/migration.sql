-- Keep indexes reproducible across Dokploy, staging, restores, and fresh installs.
-- IF NOT EXISTS is intentional: some production indexes were created manually.
CREATE INDEX IF NOT EXISTS "Task_folderId_status_idx" ON "Task"("folderId", "status");
CREATE INDEX IF NOT EXISTS "Task_createdAt_idx" ON "Task"("createdAt");
CREATE INDEX IF NOT EXISTS "Task_createdById_idx" ON "Task"("createdById");
CREATE INDEX IF NOT EXISTS "Task_isPublic_status_idx" ON "Task"("isPublic", "status");
CREATE INDEX IF NOT EXISTS "Task_folderId_isPublic_status_createdAt_idx" ON "Task"("folderId", "isPublic", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Task_isPremium_idx" ON "Task"("isPremium");
CREATE INDEX IF NOT EXISTS "Folder_parentId_createdAt_idx" ON "Folder"("parentId", "createdAt");
CREATE INDEX IF NOT EXISTS "WordItem_taskId_idx" ON "WordItem"("taskId");
CREATE INDEX IF NOT EXISTS "Question_taskId_order_idx" ON "Question"("taskId", "order");
CREATE INDEX IF NOT EXISTS "Question_criterionId_idx" ON "Question"("criterionId");
CREATE INDEX IF NOT EXISTS "ClassTask_taskId_idx" ON "ClassTask"("taskId");
CREATE INDEX IF NOT EXISTS "Attempt_taskId_idx" ON "Attempt"("taskId");
CREATE INDEX IF NOT EXISTS "Attempt_status_completedAt_idx" ON "Attempt"("status", "completedAt");
CREATE INDEX IF NOT EXISTS "StudentAnswer_questionId_idx" ON "StudentAnswer"("questionId");
CREATE INDEX IF NOT EXISTS "StudentActivity_createdAt_idx" ON "StudentActivity"("createdAt");
CREATE INDEX IF NOT EXISTS "StudentActivity_attemptId_idx" ON "StudentActivity"("attemptId");
CREATE INDEX IF NOT EXISTS "StudentActivity_scheduledTaskId_idx" ON "StudentActivity"("scheduledTaskId");
CREATE INDEX IF NOT EXISTS "User_role_createdAt_idx" ON "User"("role", "createdAt");
CREATE INDEX IF NOT EXISTS "User_role_isActive_idx" ON "User"("role", "isActive");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "UserSubscription_stripeSubscriptionId_idx" ON "UserSubscription"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "UserSubscription_stripeCustomerId_idx" ON "UserSubscription"("stripeCustomerId");
