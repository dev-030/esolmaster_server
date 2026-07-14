/*
  Warnings:

  - You are about to drop the column `classId` on the `ClassScheduledTask` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ClassScheduledTask" DROP CONSTRAINT "ClassScheduledTask_classId_fkey";

-- DropIndex
DROP INDEX "ClassScheduledTask_classId_taskId_key";

-- AlterTable
ALTER TABLE "ClassScheduledTask" DROP COLUMN "classId";
