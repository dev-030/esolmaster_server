/*
  Warnings:

  - The values [COMPLETE_TASKS,TOTAL_XP] on the enum `BadgeConditionType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `conditionValue` on the `Badge` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `Badge` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `conditionConfig` to the `Badge` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Badge` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `StudentBadge` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "BadgeConditionType_new" AS ENUM ('COMPLETE_TASKS_WITHIN_DAYS', 'SCORE_PERCENTAGE', 'CONSECUTIVE_SCORE_PERCENTAGE', 'SCORE_PERCENTAGE_IN_TASKS_WITHIN_DAYS', 'XP_WITHIN_TIME', 'STREAK_DAYS', 'ATTEMPT_COUNT');
ALTER TABLE "Badge" ALTER COLUMN "conditionType" TYPE "BadgeConditionType_new" USING ("conditionType"::text::"BadgeConditionType_new");
ALTER TYPE "BadgeConditionType" RENAME TO "BadgeConditionType_old";
ALTER TYPE "BadgeConditionType_new" RENAME TO "BadgeConditionType";
DROP TYPE "public"."BadgeConditionType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Badge" DROP COLUMN "conditionValue",
ADD COLUMN     "conditionConfig" JSONB NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "StudentBadge" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Badge_name_key" ON "Badge"("name");

-- CreateIndex
CREATE INDEX "StudentBadge_studentId_idx" ON "StudentBadge"("studentId");

-- CreateIndex
CREATE INDEX "StudentBadge_badgeId_idx" ON "StudentBadge"("badgeId");
