/*
  Warnings:

  - A unique constraint covering the columns `[classTaskId]` on the table `ClassScheduledTask` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `classTaskId` to the `ClassScheduledTask` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ClassTask" DROP CONSTRAINT "ClassTask_classScheduledTaskId_fkey";

-- AlterTable
ALTER TABLE "ClassScheduledTask" ADD COLUMN     "classTaskId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ClassScheduledTask_classTaskId_key" ON "ClassScheduledTask"("classTaskId");

-- AddForeignKey
ALTER TABLE "ClassScheduledTask" ADD CONSTRAINT "ClassScheduledTask_classTaskId_fkey" FOREIGN KEY ("classTaskId") REFERENCES "ClassTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
