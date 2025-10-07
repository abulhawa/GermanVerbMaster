ALTER TABLE "practice_history" DROP CONSTRAINT IF EXISTS "practice_history_user_id_users_id_fk";
ALTER TABLE "verb_practice_history" DROP CONSTRAINT IF EXISTS "verb_practice_history_user_id_users_id_fk";
ALTER TABLE "verb_review_queues" DROP CONSTRAINT IF EXISTS "verb_review_queues_user_id_users_id_fk";
ALTER TABLE "verb_scheduling_state" DROP CONSTRAINT IF EXISTS "verb_scheduling_state_user_id_users_id_fk";
ALTER TABLE "scheduling_state" DROP CONSTRAINT IF EXISTS "scheduling_state_user_id_users_id_fk";

ALTER TABLE "practice_history" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
ALTER TABLE "verb_practice_history" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
ALTER TABLE "verb_review_queues" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
ALTER TABLE "verb_scheduling_state" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
ALTER TABLE "scheduling_state" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;

ALTER TABLE "practice_history" ADD CONSTRAINT "practice_history_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "verb_practice_history" ADD CONSTRAINT "verb_practice_history_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "verb_review_queues" ADD CONSTRAINT "verb_review_queues_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "verb_scheduling_state" ADD CONSTRAINT "verb_scheduling_state_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "scheduling_state" ADD CONSTRAINT "scheduling_state_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
