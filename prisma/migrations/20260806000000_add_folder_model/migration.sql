-- CreateTable: Folder (safe - only runs if table doesn't already exist)
CREATE TABLE IF NOT EXISTS "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: Folder self-referencing parent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Folder_parentId_fkey'
  ) THEN
    ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddColumn: folderId on Task (safe - only adds if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='Task' AND column_name='folderId'
  ) THEN
    ALTER TABLE "Task" ADD COLUMN "folderId" TEXT;
  END IF;
END $$;

-- AddForeignKey: Task -> Folder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Task_folderId_fkey'
  ) THEN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_folderId_fkey"
      FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
