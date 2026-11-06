-- MSF ARGENTINA - CONTROL DE JORNADA 3.0
-- Schema Migration 001: Core Architecture, Tables, Constraints, Functions, RLS & Seeds

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Timezone default for session / functions
SET timezone = 'America/Argentina/Buenos_Aires';

---------------------------------------------------------
-- 1. ENUMS & DOMAINS
---------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'COLLECTOR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE work_day_status AS ENUM ('OPEN', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_type AS ENUM ('credit_card', 'debit_card', 'bank_cbu', 'prepaid_wallet');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

---------------------------------------------------------
-- 2. TABLES
---------------------------------------------------------

-- 2.1 APP SETTINGS
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW())
);

-- 2.2 PAYMENT METHOD RULES
CREATE TABLE IF NOT EXISTS public.payment_method_rules (
    payment_type payment_method_type PRIMARY KEY,
    label TEXT NOT NULL,
    points NUMERIC(4, 2) NOT NULL CHECK (points >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW())
);

-- 2.3 PROFILES (Mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'COLLECTOR',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW())
);

-- 2.4 TEAM MEMBERS (Preloaded official members list)
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL UNIQUE,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    role user_role NOT NULL DEFAULT 'COLLECTOR',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW())
);

-- 2.5 WORK DAYS (Daily work session)
CREATE TABLE IF NOT EXISTS public.work_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_date DATE NOT NULL UNIQUE,
    status work_day_status NOT NULL DEFAULT 'OPEN',
    declared_collectors_count INTEGER NOT NULL DEFAULT 0 CHECK (declared_collectors_count >= 0),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    closed_at TIMESTAMPTZ,
    auto_closed BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW())
);

-- 2.6 SHIFT ASSIGNMENTS (Declared individual hours)
CREATE TABLE IF NOT EXISTS public.shift_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_day_id UUID NOT NULL REFERENCES public.work_days(id) ON DELETE CASCADE,
    team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE RESTRICT,
    hours_worked NUMERIC(4, 2) NOT NULL DEFAULT 0.00 CHECK (hours_worked >= 0 AND hours_worked <= 24),
    is_present BOOLEAN NOT NULL DEFAULT true,
    declared_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    CONSTRAINT unique_member_per_day UNIQUE (work_day_id, team_member_id)
);

-- 2.7 PARTNERS (Socios registrados)
CREATE TABLE IF NOT EXISTS public.partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_day_id UUID NOT NULL REFERENCES public.work_days(id) ON DELETE CASCADE,
    team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE RESTRICT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    sequence_number INTEGER NOT NULL,
    payment_type payment_method_type NOT NULL,
    points NUMERIC(4, 2) NOT NULL CHECK (points >= 0),
    age INTEGER NOT NULL CHECK (age >= 16 AND age <= 120),
    contribution_amount NUMERIC(12, 2) NOT NULL CHECK (contribution_amount > 0),
    contribution_frequency TEXT NOT NULL DEFAULT 'monthly',
    captured_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    additional_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    CONSTRAINT unique_sequence_per_day UNIQUE (work_day_id, sequence_number)
);

-- 2.8 DAILY CLOSURES (Consolidated stats snapshot & WhatsApp text)
CREATE TABLE IF NOT EXISTS public.daily_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_day_id UUID NOT NULL UNIQUE REFERENCES public.work_days(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    summary_data JSONB NOT NULL,
    whatsapp_message TEXT NOT NULL,
    closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW())
);

-- 2.9 AUDIT LOG
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('America/Argentina/Buenos_Aires', NOW())
);

---------------------------------------------------------
-- 3. INDEXES FOR HIGH PERFORMANCE
---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_work_days_date ON public.work_days(work_date);
CREATE INDEX IF NOT EXISTS idx_work_days_status ON public.work_days(status);
CREATE INDEX IF NOT EXISTS idx_partners_day_member ON public.partners(work_day_id, team_member_id);
CREATE INDEX IF NOT EXISTS idx_partners_payment_type ON public.partners(payment_type);
CREATE INDEX IF NOT EXISTS idx_shift_day_member ON public.shift_assignments(work_day_id, team_member_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);

---------------------------------------------------------
-- 4. BUSINESS LOGIC FUNCTIONS & PROCEDURES
---------------------------------------------------------

-- 4.1 Helper to get current Buenos Aires Date
CREATE OR REPLACE FUNCTION public.get_current_buenos_aires_date()
RETURNS DATE AS $$
BEGIN
    RETURN (TIMEZONE('America/Argentina/Buenos_Aires', NOW()))::DATE;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4.2 Helper to check if caller is ADMIN
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    v_role user_role;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;
    SELECT role INTO v_role FROM public.profiles WHERE auth_user_id = auth.uid() AND is_active = true;
    RETURN (v_role = 'ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.3 Get or create current work day atomically
CREATE OR REPLACE FUNCTION public.get_or_create_current_work_day()
RETURNS public.work_days AS $$
DECLARE
    v_today DATE;
    v_day public.work_days;
BEGIN
    v_today := public.get_current_buenos_aires_date();
    
    SELECT * INTO v_day FROM public.work_days WHERE work_date = v_today;
    
    IF v_day.id IS NULL THEN
        INSERT INTO public.work_days (work_date, status, declared_collectors_count, opened_at)
        VALUES (v_today, 'OPEN', 0, TIMEZONE('America/Argentina/Buenos_Aires', NOW()))
        ON CONFLICT (work_date) DO UPDATE SET updated_at = NOW()
        RETURNING * INTO v_day;
    END IF;
    
    RETURN v_day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.4 Trigger to enforce points from payment_method_rules and atomic sequence_number
CREATE OR REPLACE FUNCTION public.trg_partner_points_and_sequence()
RETURNS TRIGGER AS $$
DECLARE
    v_points NUMERIC(4,2);
    v_seq INTEGER;
    v_day_status work_day_status;
BEGIN
    -- Check day is OPEN
    SELECT status INTO v_day_status FROM public.work_days WHERE id = NEW.work_day_id;
    IF v_day_status = 'CLOSED' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Cannot register partners in a closed work day';
    END IF;

    -- Lookup points from rules
    SELECT points INTO v_points FROM public.payment_method_rules WHERE payment_type = NEW.payment_type;
    IF v_points IS NULL THEN
        CASE NEW.payment_type
            WHEN 'credit_card' THEN v_points := 1.0;
            WHEN 'debit_card' THEN v_points := 0.7;
            WHEN 'bank_cbu' THEN v_points := 0.6;
            WHEN 'prepaid_wallet' THEN v_points := 0.4;
            ELSE v_points := 0.0;
        END CASE;
    END IF;
    NEW.points := v_points;

    -- Atomically assign next sequence_number if not provided or 0
    IF NEW.sequence_number IS NULL OR NEW.sequence_number <= 0 THEN
        SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_seq
        FROM public.partners
        WHERE work_day_id = NEW.work_day_id;
        
        NEW.sequence_number := v_seq;
    END IF;

    IF NEW.captured_at IS NULL THEN
        NEW.captured_at := TIMEZONE('America/Argentina/Buenos_Aires', NOW());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_partners_before_insert ON public.partners;
CREATE TRIGGER trg_partners_before_insert
BEFORE INSERT ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.trg_partner_points_and_sequence();

-- 4.5 Stored Procedure to close a work day and calculate consolidated summary
CREATE OR REPLACE FUNCTION public.close_work_day(p_work_day_id UUID, p_closed_by UUID DEFAULT NULL, p_auto BOOLEAN DEFAULT false)
RETURNS public.daily_closures AS $$
DECLARE
    v_day public.work_days;
    v_total_partners INTEGER;
    v_total_points NUMERIC(10,2);
    v_total_amount NUMERIC(14,2);
    v_total_hours NUMERIC(10,2);
    v_card_cc_count INTEGER := 0;
    v_card_cc_points NUMERIC(10,2) := 0;
    v_card_deb_count INTEGER := 0;
    v_card_deb_points NUMERIC(10,2) := 0;
    v_cbu_count INTEGER := 0;
    v_cbu_points NUMERIC(10,2) := 0;
    v_prepaid_count INTEGER := 0;
    v_prepaid_points NUMERIC(10,2) := 0;
    v_summary JSONB;
    v_wa_message TEXT;
    v_closure public.daily_closures;
    v_members_cursor CURSOR FOR 
        SELECT tm.display_name, 
               COALESCE(sa.hours_worked, 0) as hours,
               COUNT(p.id) as partners_count,
               COALESCE(SUM(p.points), 0) as points_sum,
               COALESCE(SUM(p.contribution_amount), 0) as amount_sum,
               COUNT(p.id) FILTER (WHERE p.payment_type = 'credit_card') as cc_count,
               COUNT(p.id) FILTER (WHERE p.payment_type = 'debit_card') as deb_count,
               COUNT(p.id) FILTER (WHERE p.payment_type = 'bank_cbu') as cbu_count,
               COUNT(p.id) FILTER (WHERE p.payment_type = 'prepaid_wallet') as prep_count
        FROM public.team_members tm
        LEFT JOIN public.shift_assignments sa ON sa.team_member_id = tm.id AND sa.work_day_id = p_work_day_id
        LEFT JOIN public.partners p ON p.team_member_id = tm.id AND p.work_day_id = p_work_day_id
        WHERE tm.is_active = true
        GROUP BY tm.id, tm.display_name, sa.hours_worked
        ORDER BY tm.display_name ASC;
    v_m RECORD;
    v_members_json JSONB := '[]'::jsonb;
    v_indiv_wa TEXT := '';
BEGIN
    SELECT * INTO v_day FROM public.work_days WHERE id = p_work_day_id FOR UPDATE;
    IF v_day.id IS NULL THEN
        RAISE EXCEPTION 'Work day not found';
    END IF;

    -- Aggregate totals
    SELECT 
        COUNT(id), 
        COALESCE(SUM(points), 0), 
        COALESCE(SUM(contribution_amount), 0),
        COUNT(id) FILTER (WHERE payment_type = 'credit_card'),
        COALESCE(SUM(points) FILTER (WHERE payment_type = 'credit_card'), 0),
        COUNT(id) FILTER (WHERE payment_type = 'debit_card'),
        COALESCE(SUM(points) FILTER (WHERE payment_type = 'debit_card'), 0),
        COUNT(id) FILTER (WHERE payment_type = 'bank_cbu'),
        COALESCE(SUM(points) FILTER (WHERE payment_type = 'bank_cbu'), 0),
        COUNT(id) FILTER (WHERE payment_type = 'prepaid_wallet'),
        COALESCE(SUM(points) FILTER (WHERE payment_type = 'prepaid_wallet'), 0)
    INTO 
        v_total_partners, v_total_points, v_total_amount,
        v_card_cc_count, v_card_cc_points,
        v_card_deb_count, v_card_deb_points,
        v_cbu_count, v_cbu_points,
        v_prepaid_count, v_prepaid_points
    FROM public.partners 
    WHERE work_day_id = p_work_day_id;

    SELECT COALESCE(SUM(hours_worked), 0) INTO v_total_hours
    FROM public.shift_assignments
    WHERE work_day_id = p_work_day_id;

    -- Iterate members
    FOR v_m IN v_members_cursor LOOP
        v_members_json := v_members_json || jsonb_build_object(
            'name', v_m.display_name,
            'hours', v_m.hours,
            'partners_count', v_m.partners_count,
            'points', v_m.points_sum,
            'amount', v_m.amount_sum,
            'credit_card_count', v_m.cc_count,
            'debit_card_count', v_m.deb_count,
            'bank_cbu_count', v_m.cbu_count,
            'prepaid_wallet_count', v_m.prep_count,
            'partners_per_hour', CASE WHEN v_m.hours > 0 THEN ROUND((v_m.partners_count::numeric / v_m.hours), 2) ELSE NULL END,
            'points_per_hour', CASE WHEN v_m.hours > 0 THEN ROUND((v_m.points_sum::numeric / v_m.hours), 2) ELSE NULL END,
            'amount_per_hour', CASE WHEN v_m.hours > 0 THEN ROUND((v_m.amount_sum::numeric / v_m.hours), 2) ELSE NULL END
        );

        v_indiv_wa := v_indiv_wa || E'\n' || v_m.display_name || E':\n' ||
            'Horas: ' || v_m.hours || E'\n' ||
            'Socios: ' || v_m.partners_count || E'\n' ||
            'Puntos: ' || v_m.points_sum || E'\n' ||
            'Dinero: $' || TO_CHAR(v_m.amount_sum, 'FM999,999,990.00') || E'\n' ||
            'Socios/hora: ' || CASE WHEN v_m.hours > 0 THEN TO_CHAR(ROUND((v_m.partners_count::numeric / v_m.hours), 2), 'FM990.00') ELSE 'N/D' END || E'\n' ||
            'Puntos/hora: ' || CASE WHEN v_m.hours > 0 THEN TO_CHAR(ROUND((v_m.points_sum::numeric / v_m.hours), 2), 'FM990.00') ELSE 'N/D' END || E'\n' ||
            'Dinero/hora: ' || CASE WHEN v_m.hours > 0 THEN '$' || TO_CHAR(ROUND((v_m.amount_sum::numeric / v_m.hours), 2), 'FM999,990.00') ELSE 'N/D' END || E'\n';
    END LOOP;

    v_summary := jsonb_build_object(
        'work_date', v_day.work_date,
        'declared_collectors', v_day.declared_collectors_count,
        'total_hours', v_total_hours,
        'total_partners', v_total_partners,
        'total_points', v_total_points,
        'total_amount', v_total_amount,
        'breakdown', jsonb_build_object(
            'credit_card', jsonb_build_object('count', v_card_cc_count, 'points', v_card_cc_points),
            'debit_card', jsonb_build_object('count', v_card_deb_count, 'points', v_card_deb_points),
            'bank_cbu', jsonb_build_object('count', v_cbu_count, 'points', v_cbu_points),
            'prepaid_wallet', jsonb_build_object('count', v_prepaid_count, 'points', v_prepaid_points)
        ),
        'averages', jsonb_build_object(
            'partners_per_collector', CASE WHEN v_day.declared_collectors_count > 0 THEN ROUND((v_total_partners::numeric / v_day.declared_collectors_count), 2) ELSE NULL END,
            'points_per_collector', CASE WHEN v_day.declared_collectors_count > 0 THEN ROUND((v_total_points::numeric / v_day.declared_collectors_count), 2) ELSE NULL END,
            'amount_per_collector', CASE WHEN v_day.declared_collectors_count > 0 THEN ROUND((v_total_amount::numeric / v_day.declared_collectors_count), 2) ELSE NULL END,
            'hours_per_collector', CASE WHEN v_day.declared_collectors_count > 0 THEN ROUND((v_total_hours::numeric / v_day.declared_collectors_count), 2) ELSE NULL END,
            'partners_per_hour', CASE WHEN v_total_hours > 0 THEN ROUND((v_total_partners::numeric / v_total_hours), 2) ELSE NULL END,
            'points_per_hour', CASE WHEN v_total_hours > 0 THEN ROUND((v_total_points::numeric / v_total_hours), 2) ELSE NULL END,
            'amount_per_hour', CASE WHEN v_total_hours > 0 THEN ROUND((v_total_amount::numeric / v_total_hours), 2) ELSE NULL END,
            'amount_per_partner', CASE WHEN v_total_partners > 0 THEN ROUND((v_total_amount::numeric / v_total_partners), 2) ELSE NULL END,
            'points_per_partner', CASE WHEN v_total_partners > 0 THEN ROUND((v_total_points::numeric / v_total_partners), 2) ELSE NULL END
        ),
        'team_performance', v_members_json
    );

    -- Build WhatsApp formatted message
    v_wa_message := 'MSF ARGENTINA – CIERRE DE JORNADA' || E'\n' ||
        'Fecha: ' || TO_CHAR(v_day.work_date, 'DD/MM/YYYY') || E'\n\n' ||
        'RESUMEN GENERAL' || E'\n' ||
        'Captadores presentes: ' || v_day.declared_collectors_count || E'\n' ||
        'Horas totales: ' || v_total_hours || E'\n' ||
        'Socios conseguidos: ' || v_total_partners || E'\n' ||
        'Puntos obtenidos: ' || v_total_points || E'\n' ||
        'Dinero registrado: $' || TO_CHAR(v_total_amount, 'FM999,999,990.00') || E'\n\n' ||
        'MEDIOS DE CAPTACIÓN' || E'\n' ||
        'Tarjeta de crédito: ' || v_card_cc_count || ' – ' || v_card_cc_points || ' pts' || E'\n' ||
        'Tarjeta de débito: ' || v_card_deb_count || ' – ' || v_card_deb_points || ' pts' || E'\n' ||
        'CBU bancario: ' || v_cbu_count || ' – ' || v_cbu_points || ' pts' || E'\n' ||
        'Tarjeta prepaga / billetera: ' || v_prepaid_count || ' – ' || v_prepaid_points || ' pts' || E'\n\n' ||
        'PROMEDIOS GENERALES' || E'\n' ||
        'Socios por captador: ' || CASE WHEN v_day.declared_collectors_count > 0 THEN TO_CHAR(ROUND((v_total_partners::numeric / v_day.declared_collectors_count), 2), 'FM990.00') ELSE 'N/D' END || E'\n' ||
        'Puntos por captador: ' || CASE WHEN v_day.declared_collectors_count > 0 THEN TO_CHAR(ROUND((v_total_points::numeric / v_day.declared_collectors_count), 2), 'FM990.00') ELSE 'N/D' END || E'\n' ||
        'Dinero por captador: ' || CASE WHEN v_day.declared_collectors_count > 0 THEN '$' || TO_CHAR(ROUND((v_total_amount::numeric / v_day.declared_collectors_count), 2), 'FM999,990.00') ELSE 'N/D' END || E'\n' ||
        'Horas por captador: ' || CASE WHEN v_day.declared_collectors_count > 0 THEN TO_CHAR(ROUND((v_total_hours::numeric / v_day.declared_collectors_count), 2), 'FM990.00') ELSE 'N/D' END || E'\n' ||
        'Socios por hora: ' || CASE WHEN v_total_hours > 0 THEN TO_CHAR(ROUND((v_total_partners::numeric / v_total_hours), 2), 'FM990.00') ELSE 'N/D' END || E'\n' ||
        'Puntos por hora: ' || CASE WHEN v_total_hours > 0 THEN TO_CHAR(ROUND((v_total_points::numeric / v_total_hours), 2), 'FM990.00') ELSE 'N/D' END || E'\n' ||
        'Dinero por hora: ' || CASE WHEN v_total_hours > 0 THEN '$' || TO_CHAR(ROUND((v_total_amount::numeric / v_total_hours), 2), 'FM999,990.00') ELSE 'N/D' END || E'\n' ||
        'Importe promedio por socio: ' || CASE WHEN v_total_partners > 0 THEN '$' || TO_CHAR(ROUND((v_total_amount::numeric / v_total_partners), 2), 'FM999,990.00') ELSE 'N/D' END || E'\n\n' ||
        'RENDIMIENTO INDIVIDUAL' ||
        v_indiv_wa;

    -- Update work day
    UPDATE public.work_days
    SET status = 'CLOSED',
        closed_at = TIMEZONE('America/Argentina/Buenos_Aires', NOW()),
        auto_closed = p_auto,
        updated_at = NOW()
    WHERE id = p_work_day_id;

    -- Save daily closure
    INSERT INTO public.daily_closures (work_day_id, work_date, summary_data, whatsapp_message, closed_by, closed_at)
    VALUES (p_work_day_id, v_day.work_date, v_summary, v_wa_message, p_closed_by, TIMEZONE('America/Argentina/Buenos_Aires', NOW()))
    ON CONFLICT (work_day_id) DO UPDATE SET
        summary_data = EXCLUDED.summary_data,
        whatsapp_message = EXCLUDED.whatsapp_message,
        closed_at = EXCLUDED.closed_at
    RETURNING * INTO v_closure;

    RETURN v_closure;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.6 Midnight automatic transition function
CREATE OR REPLACE FUNCTION public.execute_midnight_rollover()
RETURNS JSONB AS $$
DECLARE
    v_yesterday DATE;
    v_today DATE;
    v_open_day public.work_days;
    v_new_day public.work_days;
    v_closure public.daily_closures;
BEGIN
    v_today := public.get_current_buenos_aires_date();
    v_yesterday := v_today - INTERVAL '1 day';

    -- Find any open days prior to today
    FOR v_open_day IN SELECT * FROM public.work_days WHERE status = 'OPEN' AND work_date < v_today LOOP
        v_closure := public.close_work_day(v_open_day.id, NULL, true);
    END LOOP;

    -- Ensure today's work day is created and ready with 0 collectors count
    v_new_day := public.get_or_create_current_work_day();

    RETURN jsonb_build_object(
        'status', 'success',
        'current_work_date', v_new_day.work_date,
        'current_work_day_id', v_new_day.id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

---------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
---------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_method_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can update profiles" ON public.profiles
FOR ALL TO authenticated USING (public.is_admin());

-- TEAM MEMBERS
CREATE POLICY "Team members are viewable by authenticated users" ON public.team_members
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can modify team members" ON public.team_members
FOR ALL TO authenticated USING (public.is_admin());

-- PAYMENT RULES & SETTINGS
CREATE POLICY "Settings are readable by authenticated users" ON public.app_settings
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manages settings" ON public.app_settings
FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Rules are readable by authenticated users" ON public.payment_method_rules
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manages rules" ON public.payment_method_rules
FOR ALL TO authenticated USING (public.is_admin());

-- WORK DAYS
CREATE POLICY "Work days viewable by authenticated" ON public.work_days
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin or system can create/update work days" ON public.work_days
FOR ALL TO authenticated USING (public.is_admin());

-- SHIFT ASSIGNMENTS (HOURS)
CREATE POLICY "Shift assignments viewable by all authenticated" ON public.shift_assignments
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Collectors can insert/update own shift" ON public.shift_assignments
FOR ALL TO authenticated
USING (
    public.is_admin() OR 
    team_member_id IN (
        SELECT tm.id FROM public.team_members tm
        JOIN public.profiles p ON p.id = tm.profile_id
        WHERE p.auth_user_id = auth.uid()
    )
)
WITH CHECK (
    public.is_admin() OR 
    team_member_id IN (
        SELECT tm.id FROM public.team_members tm
        JOIN public.profiles p ON p.id = tm.profile_id
        WHERE p.auth_user_id = auth.uid()
    )
);

-- PARTNERS
CREATE POLICY "Partners are viewable by all authenticated users" ON public.partners
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Collectors can insert partners with own member id" ON public.partners
FOR INSERT TO authenticated
WITH CHECK (
    public.is_admin() OR 
    team_member_id IN (
        SELECT tm.id FROM public.team_members tm
        JOIN public.profiles p ON p.id = tm.profile_id
        WHERE p.auth_user_id = auth.uid()
    )
);

CREATE POLICY "Collectors can update/delete own partners or admin can modify all" ON public.partners
FOR UPDATE TO authenticated
USING (
    public.is_admin() OR 
    team_member_id IN (
        SELECT tm.id FROM public.team_members tm
        JOIN public.profiles p ON p.id = tm.profile_id
        WHERE p.auth_user_id = auth.uid()
    )
)
WITH CHECK (
    public.is_admin() OR 
    team_member_id IN (
        SELECT tm.id FROM public.team_members tm
        JOIN public.profiles p ON p.id = tm.profile_id
        WHERE p.auth_user_id = auth.uid()
    )
);

CREATE POLICY "Collectors can delete own partners or admin all" ON public.partners
FOR DELETE TO authenticated
USING (
    public.is_admin() OR 
    team_member_id IN (
        SELECT tm.id FROM public.team_members tm
        JOIN public.profiles p ON p.id = tm.profile_id
        WHERE p.auth_user_id = auth.uid()
    )
);

-- DAILY CLOSURES
CREATE POLICY "Closures are viewable by all authenticated users" ON public.daily_closures
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admin can insert or update closures directly" ON public.daily_closures
FOR ALL TO authenticated USING (public.is_admin());

-- AUDIT LOG
CREATE POLICY "Only admin can view audit logs" ON public.audit_log
FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_log
FOR INSERT TO authenticated WITH CHECK (true);

---------------------------------------------------------
-- 6. SEED DATA (Exact initial state requested)
---------------------------------------------------------

-- 6.1 Payment Rules
INSERT INTO public.payment_method_rules (payment_type, label, points, is_active)
VALUES 
    ('credit_card', 'Tarjeta de Crédito', 1.00, true),
    ('debit_card', 'Tarjeta de Débito', 0.70, true),
    ('bank_cbu', 'CBU / CVU Bancario', 0.60, true),
    ('prepaid_wallet', 'Tarjeta Prepaga / Billetera Virtual', 0.40, true)
ON CONFLICT (payment_type) DO UPDATE SET
    points = EXCLUDED.points,
    label = EXCLUDED.label;

-- 6.2 Preload Carlos Díaz (Admin) and the 7 Collectors (NO Morena)
INSERT INTO public.team_members (display_name, role, is_active)
VALUES
    ('Carlos Díaz', 'ADMIN', true),
    ('Ariel', 'COLLECTOR', true),
    ('Lucía', 'COLLECTOR', true),
    ('Emilce', 'COLLECTOR', true),
    ('Selena', 'COLLECTOR', true),
    ('Brenda', 'COLLECTOR', true),
    ('Rosario', 'COLLECTOR', true),
    ('Nicolás', 'COLLECTOR', true)
ON CONFLICT (display_name) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

-- 6.3 App Settings
INSERT INTO public.app_settings (key, value, description)
VALUES 
    ('app_name', '"MSF Argentina - Control de Jornada 3.0"', 'Nombre de la aplicación'),
    ('timezone', '"America/Argentina/Buenos_Aires"', 'Zona horaria oficial'),
    ('allow_public_signup', 'false', 'Registro público deshabilitado')
ON CONFLICT (key) DO NOTHING;

-- 6.4 Enable Realtime on tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_days;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.partners;
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_closures;

