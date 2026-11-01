-- Preserve proposal revisions: edits must INSERT a new revision.
CREATE FUNCTION "reject_proposal_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Proposals are immutable; insert a new revision instead.'
    USING ERRCODE = '23514', CONSTRAINT = 'proposals_immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "proposals_immutable"
BEFORE UPDATE ON "proposals"
FOR EACH ROW EXECUTE FUNCTION "reject_proposal_update"();
