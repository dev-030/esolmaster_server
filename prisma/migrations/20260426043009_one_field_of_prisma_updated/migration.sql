/*
  Warnings:

  - You are about to drop the column `iconUrl` on the `Badge` table. All the data in the column will be lost.
  - Added the required column `iconName` to the `Badge` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Badge" DROP COLUMN "iconUrl",
ADD COLUMN     "iconName" TEXT NOT NULL;
