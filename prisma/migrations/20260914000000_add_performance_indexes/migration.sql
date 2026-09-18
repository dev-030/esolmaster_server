-- CreateIndex
CREATE INDEX "Class_teacherId_idx" ON "Class"("teacherId");

-- CreateIndex
CREATE INDEX "ClassTask_classId_idx" ON "ClassTask"("classId");

-- CreateIndex
CREATE INDEX "ClassScheduledTask_scheduledAt_idx" ON "ClassScheduledTask"("scheduledAt");

-- CreateIndex
CREATE INDEX "ClassScheduledTask_isActive_dueAt_idx" ON "ClassScheduledTask"("isActive", "dueAt");

-- CreateIndex
CREATE INDEX "Attempt_studentId_status_completedAt_idx" ON "Attempt"("studentId", "status", "completedAt");

-- CreateIndex
CREATE INDEX "Attempt_scheduledTaskId_status_idx" ON "Attempt"("scheduledTaskId", "status");

-- CreateIndex
CREATE INDEX "StudentActivity_studentId_createdAt_idx" ON "StudentActivity"("studentId", "createdAt");
