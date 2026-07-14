/*
  Warnings:

  - The values [LEVEL3,LEVEL4,LEVEL5,LEVEL6,LEVEL7,LEVEL8,LEVEL9,LEVEL10] on the enum `EntryType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EntryType_new" AS ENUM ('ENTRY1', 'ENTRY2', 'ENTRY3', 'LEVEL1', 'LEVEL2');
ALTER TABLE "ReadingTask" ALTER COLUMN "entryType" TYPE "EntryType_new"[] USING ("entryType"::text::"EntryType_new"[]);
ALTER TABLE "GrammarTask" ALTER COLUMN "entryType" TYPE "EntryType_new"[] USING ("entryType"::text::"EntryType_new"[]);
ALTER TYPE "EntryType" RENAME TO "EntryType_old";
ALTER TYPE "EntryType_new" RENAME TO "EntryType";
DROP TYPE "public"."EntryType_old";
COMMIT;
