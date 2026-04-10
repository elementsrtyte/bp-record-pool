-- Original vs. remix designation on catalog tracks (manual uploader flag; default original).
DO $$ BEGIN
  CREATE TYPE "track_work_kind" AS ENUM ('original', 'remix');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "tracks" ADD COLUMN IF NOT EXISTS "work_kind" "track_work_kind" DEFAULT 'original' NOT NULL;
