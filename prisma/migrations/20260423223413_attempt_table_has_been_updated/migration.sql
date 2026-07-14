-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "achievedCriteria" TEXT[],
ADD COLUMN     "isPassed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missingCriteria" TEXT[];
