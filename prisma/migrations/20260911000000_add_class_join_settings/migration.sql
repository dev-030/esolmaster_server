CREATE TYPE "ClassJoinStatus" AS ENUM ('OPEN', 'PAUSED', 'CLOSED');

ALTER TABLE "Class"
ADD COLUMN "joinCode" TEXT,
ADD COLUMN "joinStatus" "ClassJoinStatus" NOT NULL DEFAULT 'OPEN';

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS number
  FROM "Class"
)
UPDATE "Class" AS classes
SET "joinCode" = 'C' || LPAD(numbered.number::TEXT, 7, '0')
FROM numbered
WHERE classes."id" = numbered."id";

ALTER TABLE "Class" ALTER COLUMN "joinCode" SET NOT NULL;

CREATE UNIQUE INDEX "Class_joinCode_key" ON "Class"("joinCode");
