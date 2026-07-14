-- CreateTable
CREATE TABLE "ClassTask" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classScheduledTaskId" TEXT,

    CONSTRAINT "ClassTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassTask_classId_taskId_key" ON "ClassTask"("classId", "taskId");

-- AddForeignKey
ALTER TABLE "ClassTask" ADD CONSTRAINT "ClassTask_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTask" ADD CONSTRAINT "ClassTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTask" ADD CONSTRAINT "ClassTask_classScheduledTaskId_fkey" FOREIGN KEY ("classScheduledTaskId") REFERENCES "ClassScheduledTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
