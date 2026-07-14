/*
  Warnings:

  - The `entryType` column on the `GrammarTask` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `entryType` column on the `ReadingTask` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('ENTRY1', 'ENTRY2', 'ENTRY3', 'LEVEL1', 'LEVEL2', 'LEVEL3', 'LEVEL4', 'LEVEL5', 'LEVEL6', 'LEVEL7', 'LEVEL8', 'LEVEL9', 'LEVEL10');

-- AlterTable
ALTER TABLE "GrammarTask" DROP COLUMN "entryType",
ADD COLUMN     "entryType" "EntryType"[];

-- AlterTable
ALTER TABLE "ReadingTask" DROP COLUMN "entryType",
ADD COLUMN     "entryType" "EntryType"[];
