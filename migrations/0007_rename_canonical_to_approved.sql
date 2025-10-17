ALTER TABLE words RENAME COLUMN canonical TO approved;
ALTER TABLE words ALTER COLUMN approved SET DEFAULT false;

UPDATE "enrichment"."enrichment_provider_snapshots"
SET mode = 'approved'
WHERE mode = 'canonical';

UPDATE "enrichment"."enrichment_provider_snapshots"
SET mode = 'pending'
WHERE mode = 'non-canonical';
