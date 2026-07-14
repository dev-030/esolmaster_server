/*
  Warnings:

  - You are about to drop the column `totalTasks` on the `StudentMonthlyStats` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "StudentMonthlyStats" DROP COLUMN "totalTasks";

-- AlterTable
ALTER TABLE "StudentSkillProgress" ADD COLUMN     "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "xpPerQuestion" INTEGER NOT NULL DEFAULT 5;
