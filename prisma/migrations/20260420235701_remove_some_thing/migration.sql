/*
  Warnings:

  - You are about to drop the column `taskId` on the `ClassScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the column `classScheduledTaskId` on the `ClassTask` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ClassScheduledTask" DROP CONSTRAINT "ClassScheduledTask_taskId_fkey";

-- AlterTable
ALTER TABLE "ClassScheduledTask" DROP COLUMN "taskId";

-- AlterTable
ALTER TABLE "ClassTask" DROP COLUMN "classScheduledTaskId";
