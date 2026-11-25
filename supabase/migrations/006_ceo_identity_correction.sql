-- =============================================================================
-- DESTRIA TECH INC (DESTRIA NETWORK)
-- Migration 006: Authorized Corporate Identity Correction (Founder & CEO Name)
--
-- Official Authorization:
--   Incorrect Name : Desmond Hines
--   Correct Name   : Desmond Hinds
--   Official Title : Founder & Chief Executive Officer
--
-- Scope & Data Integrity Guarantees:
--   1. Narrowly scoped to authorized current executive records ONLY:
--      - public.admin_users (active executive administrator profile)
--      - public.consultation_appointments (non-finalized CEO pathway rows only:
--        'pending_review', 'confirmed', 'rescheduled')
--      - Default value of public.consultation_appointments.assigned_consultant
--   2. Strictly preserves:
--      - Primary keys, foreign keys, UUIDs, auth_user_id links, roles, permissions
--      - Completed/cancelled historical appointments and executed contracts
--      - Financial records (orders, invoices, payments, refunds, credit wallets)
--      - Existing immutable audit logs (appends a new governance log entry only)
--   3. Must be reviewed and approved by the Repository Owner / DBA before
--      execution against staging or production databases.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_admin_updated INTEGER := 0;
  v_active_appt_updated INTEGER := 0;
BEGIN
  -- 1. Update authorized current executive record in public.admin_users (if table exists)
  IF to_regclass('public.admin_users') IS NOT NULL THEN
    UPDATE public.admin_users
    SET
      full_name = 'Desmond Hinds',
      updated_at = NOW()
    WHERE LOWER(TRIM(full_name)) = 'desmond hines';

    GET DIAGNOSTICS v_admin_updated = ROW_COUNT;

    -- Safety guard: never allow an unintended bulk update in admin_users
    IF v_admin_updated > 2 THEN
      RAISE EXCEPTION 'Safety abort: expected <= 2 admin_users rows for CEO identity correction, affected %', v_admin_updated;
    END IF;
  END IF;

  -- 2. Update column default and active/upcoming CEO consultation rows only
  --    (historical completed or cancelled records remain untouched)
  IF to_regclass('public.consultation_appointments') IS NOT NULL THEN
    ALTER TABLE public.consultation_appointments
      ALTER COLUMN assigned_consultant
      SET DEFAULT 'DESTRIA TECH INC Solutions Architecture Team';

    UPDATE public.consultation_appointments
    SET
      assigned_consultant = REPLACE(assigned_consultant, 'Desmond Hines', 'Desmond Hinds'),
      updated_at = NOW()
    WHERE executive_pathway = 'ceo'
      AND status IN ('pending_review', 'confirmed', 'rescheduled')
      AND assigned_consultant LIKE '%Desmond Hines%';

    GET DIAGNOSTICS v_active_appt_updated = ROW_COUNT;
  END IF;

  -- 3. Append immutable governance audit log entry documenting this correction
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      actor,
      actor_role,
      action,
      entity_type,
      entity_id,
      details
    ) VALUES (
      'migration:006_ceo_identity_correction',
      'system',
      'corporate_identity.ceo_name_corrected',
      'corporate_governance',
      'executive_leadership.founder_and_ceo',
      jsonb_build_object(
        'previous_value', 'Desmond Hines',
        'corrected_value', 'Desmond Hinds',
        'official_title', 'Founder & Chief Executive Officer',
        'admin_users_updated', v_admin_updated,
        'active_ceo_appointments_updated', v_active_appt_updated,
        'historical_records_preserved', TRUE
      )
    );
  END IF;

  RAISE NOTICE 'Migration 006 complete: admin_users updated = %, active CEO appointments updated = %',
    v_admin_updated, v_active_appt_updated;
END $$;

COMMIT;

-- =============================================================================
-- DOCUMENTED ROLLBACK PROCEDURE (Emergency Use Only — Requires Owner Approval)
-- =============================================================================
-- Note: Only revert if the correction was applied to the wrong target environment.
-- Inspect the audit_logs entry created above to confirm affected counts before
-- running any rollback statement.
--
-- BEGIN;
-- UPDATE public.admin_users
--   SET full_name = 'Desmond Hines', updated_at = NOW()
--   WHERE LOWER(TRIM(full_name)) = 'desmond hinds';
-- UPDATE public.consultation_appointments
--   SET assigned_consultant = REPLACE(assigned_consultant, 'Desmond Hinds', 'Desmond Hines'),
--       updated_at = NOW()
--   WHERE executive_pathway = 'ceo'
--     AND status IN ('pending_review', 'confirmed', 'rescheduled')
--     AND assigned_consultant LIKE '%Desmond Hinds%';
-- COMMIT;
