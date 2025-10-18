UPDATE "enrichment"."enrichment_provider_snapshots"
SET mode = 'approved'
WHERE mode = 'canonical';

UPDATE "enrichment"."enrichment_provider_snapshots"
SET mode = 'pending'
WHERE mode = 'non-canonical';
