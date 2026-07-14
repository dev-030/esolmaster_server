-- CreateEnum
CREATE TYPE "AwardingBody" AS ENUM ('ESB', 'ASCENTIS', 'GATEWAY', 'TRINITY');

-- CreateEnum
CREATE TYPE "PassLogicType" AS ENUM ('CRITERIA_ONLY', 'SCORE_ONLY', 'CRITERIA_AND_SCORE');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "criterionId" TEXT;

-- AlterTable
ALTER TABLE "ReadingTask" ADD COLUMN     "awardingBody" "AwardingBody",
ADD COLUMN     "passLogic" "PassLogicType" NOT NULL DEFAULT 'SCORE_ONLY',
ADD COLUMN     "passMark" INTEGER;

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Criterion_code_key" ON "Criterion"("code");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
