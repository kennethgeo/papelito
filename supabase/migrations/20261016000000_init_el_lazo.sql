-- ============================================================================
-- Migración inicial: El lazo — Intercambios de regalos
-- Fecha: 16 de octubre de 2026
-- Esquema reproducible con RLS completo, índices, esquema app_private y RPCs atómicas
-- ============================================================================

-- Esquema privado no expuesto a la API pública ni al rol anónimo
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

-- 1. TABLA: PROFILES (Perfiles de usuario)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  full_name TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#17324D',
  default_currency TEXT NOT NULL DEFAULT 'CRC' CHECK (default_currency IN ('CRC', 'USD')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABLA: CONSENTS (Consentimiento informado y términos - Ley 8968 Costa Rica)
CREATE TABLE IF NOT EXISTS public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  terms_accepted BOOLEAN NOT NULL DEFAULT false,
  data_consent_version TEXT NOT NULL,
  data_consent_accepted BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABLA: PRIVACY_REQUESTS (Solicitudes ARCO de exportación y eliminación)
CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'delete')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 4. TABLA: EXCHANGES (Eventos de intercambio)
CREATE TABLE IF NOT EXISTS public.exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  event_date DATE NOT NULL,
  registration_deadline DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Costa_Rica',
  budget_amount NUMERIC NOT NULL CHECK (budget_amount > 0),
  currency TEXT NOT NULL DEFAULT 'CRC' CHECK (currency IN ('CRC', 'USD')),
  status TEXT NOT NULL DEFAULT 'inscripcion_abierta'
    CHECK (status IN ('borrador', 'inscripcion_abierta', 'inscripcion_cerrada', 'sorteado', 'finalizado', 'cancelado')),
  suggested_theme TEXT NOT NULL DEFAULT 'general'
    CHECK (suggested_theme IN ('navidad', 'amistad', 'cumpleanos', 'general')),
  selected_theme TEXT NOT NULL DEFAULT 'general'
    CHECK (selected_theme IN ('navidad', 'amistad', 'cumpleanos', 'general')),
  manual_theme_override TEXT
    CHECK (manual_theme_override IN ('navidad', 'amistad', 'cumpleanos', 'general')),
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  current_draw_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_deadlines CHECK (registration_deadline <= event_date)
);

-- 5. TABLA: MEMBERSHIPS (Participantes y aprobación)
CREATE TABLE IF NOT EXISTS public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_organizer BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exchange_id, user_id)
);

-- 6. TABLA: INVITATIONS (Enlaces criptográficos revocables con vencimiento)
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  max_uses INT NOT NULL DEFAULT 100,
  uses_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. TABLA: EXCLUSIONS (Exclusiones privadas de sorteo)
CREATE TABLE IF NOT EXISTS public.exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  excluded_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exchange_id, user_id, excluded_user_id),
  CONSTRAINT check_exclusion_self CHECK (user_id <> excluded_user_id)
);

-- 8. TABLA: DRAW_VERSIONS (Versionado de sorteos para atomicidad e invalidación visible)
CREATE TABLE IF NOT EXISTS public.draw_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  drawn_by UUID NOT NULL REFERENCES public.profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  invalidation_reason TEXT,
  UNIQUE (exchange_id, version_number)
);

-- 9. TABLA: ASSIGNMENTS (Asignaciones secretas e inmutables)
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_version_id UUID NOT NULL REFERENCES public.draw_versions(id) ON DELETE CASCADE,
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  giver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_no_self_assignment CHECK (giver_id <> receiver_id),
  UNIQUE (draw_version_id, giver_id),
  UNIQUE (draw_version_id, receiver_id)
);

-- 10. TABLA: WISHES (Lista personal reutilizable del usuario)
CREATE TABLE IF NOT EXISTS public.wishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  approximate_price NUMERIC CHECK (approximate_price IS NULL OR approximate_price >= 0),
  currency TEXT NOT NULL DEFAULT 'CRC' CHECK (currency IN ('CRC', 'USD')),
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta', 'media', 'baja')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. TABLA: EXCHANGE_WISH_SELECTIONS (Selección explícita de deseos por intercambio)
CREATE TABLE IF NOT EXISTS public.exchange_wish_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wish_id UUID NOT NULL REFERENCES public.wishes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exchange_id, wish_id)
);

-- 12. TABLA: WISH_PURCHASES (Marca privada de comprado / elegido: solo visible para el comprador)
CREATE TABLE IF NOT EXISTS public.wish_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID NOT NULL REFERENCES public.exchanges(id) ON DELETE CASCADE,
  wish_id UUID NOT NULL REFERENCES public.wishes(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exchange_id, wish_id, buyer_id)
);

-- ============================================================================
-- ÍNDICES DE RENDIMIENTO
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_exchange ON public.memberships(exchange_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_assignments_giver ON public.assignments(giver_id);
CREATE INDEX IF NOT EXISTS idx_assignments_draw ON public.assignments(draw_version_id);
CREATE INDEX IF NOT EXISTS idx_wishes_user ON public.wishes(user_id);
CREATE INDEX IF NOT EXISTS idx_wish_selections_exchange ON public.exchange_wish_selections(exchange_id, user_id);
CREATE INDEX IF NOT EXISTS idx_wish_purchases_buyer ON public.wish_purchases(buyer_id);

-- ============================================================================
-- FUNCIONES HELPER PRIVADAS (app_private schema, SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION app_private.is_exchange_member(p_exchange_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app_private
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE exchange_id = p_exchange_id
      AND user_id = p_user_id
      AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_exchange_organizer(p_exchange_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app_private
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE exchange_id = p_exchange_id
      AND user_id = p_user_id
      AND is_organizer = true
      AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_assigned_giver(p_exchange_id UUID, p_receiver_id UUID, p_giver_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app_private
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments a
    JOIN public.draw_versions dv ON a.draw_version_id = dv.id
    WHERE a.exchange_id = p_exchange_id
      AND a.receiver_id = p_receiver_id
      AND a.giver_id = p_giver_id
      AND dv.is_active = true
  );
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private TO authenticated, service_role;

-- ============================================================================
-- VISTA PÚBLICA DE PERFILES (Solo alias y avatar_color para otros miembros)
-- ============================================================================
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
  SELECT p.id, p.alias, p.avatar_color
  FROM public.profiles p
  WHERE p.id = auth.uid()
     OR EXISTS (
       SELECT 1 FROM public.memberships m1
       JOIN public.memberships m2 ON m1.exchange_id = m2.exchange_id
       WHERE m1.user_id = auth.uid()
         AND m1.status = 'approved'
         AND m2.user_id = p.id
         AND m2.status = 'approved'
     );

REVOKE ALL ON public.public_profiles FROM PUBLIC;
GRANT SELECT ON public.public_profiles TO authenticated;

-- ============================================================================
-- TRIGGER: Asignar al creador como organizador aprobado automáticamente
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.on_exchange_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
BEGIN
  INSERT INTO public.memberships (exchange_id, user_id, is_organizer, status)
  VALUES (NEW.id, NEW.organizer_id, true, 'approved')
  ON CONFLICT (exchange_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exchange_created_add_organizer ON public.exchanges;
CREATE TRIGGER trg_exchange_created_add_organizer
  AFTER INSERT ON public.exchanges
  FOR EACH ROW
  EXECUTE FUNCTION app_private.on_exchange_created();

-- ============================================================================
-- RPCs ATÓMICAS Y SEGURAS (Funciones públicas autorizadas)
-- ============================================================================

-- 1. Vista previa de invitación (acceso para anon y authenticated)
CREATE OR REPLACE FUNCTION public.get_invitation_preview_by_hash(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_inv RECORD;
  v_exchange RECORD;
  v_organizer_alias TEXT;
BEGIN
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'not_found');
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'error', 'revoked');
  END IF;

  IF v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'expired');
  END IF;

  IF v_inv.uses_count >= v_inv.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'exhausted');
  END IF;

  SELECT * INTO v_exchange
  FROM public.exchanges
  WHERE id = v_inv.exchange_id;

  IF NOT FOUND OR v_exchange.status IN ('cancelado', 'finalizado') THEN
    RETURN jsonb_build_object('valid', false, 'error', 'exchange_unavailable');
  END IF;

  SELECT alias INTO v_organizer_alias
  FROM public.profiles
  WHERE id = v_exchange.organizer_id;

  RETURN jsonb_build_object(
    'valid', true,
    'exchange_id', v_exchange.id,
    'name', v_exchange.name,
    'description', v_exchange.description,
    'event_date', v_exchange.event_date,
    'budget_amount', v_exchange.budget_amount,
    'currency', v_exchange.currency,
    'theme', v_exchange.selected_theme,
    'requires_approval', v_exchange.requires_approval,
    'organizer_alias', COALESCE(v_organizer_alias, 'Organizador')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_invitation_preview_by_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_preview_by_hash(TEXT) TO anon, authenticated, service_role;

-- 2. Aceptación atómica de invitación con bloqueo de fila
CREATE OR REPLACE FUNCTION public.accept_invitation_atomic(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_inv RECORD;
  v_exchange RECORD;
  v_existing_status TEXT;
  v_new_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no autenticado.');
  END IF;

  -- Bloquear fila de invitación durante la transacción
  SELECT * INTO v_inv
  FROM public.invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitación no encontrada.');
  END IF;

  IF v_inv.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta invitación ha sido revocada por el organizador.');
  END IF;

  IF v_inv.expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta invitación ha expirado.');
  END IF;

  IF v_inv.uses_count >= v_inv.max_uses THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta invitación ha alcanzado su límite máximo de usos.');
  END IF;

  SELECT * INTO v_exchange
  FROM public.exchanges
  WHERE id = v_inv.exchange_id;

  IF NOT FOUND OR v_exchange.status IN ('cancelado', 'finalizado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'El intercambio no está disponible para unirse.');
  END IF;

  -- Verificar si el usuario ya es miembro
  SELECT status INTO v_existing_status
  FROM public.memberships
  WHERE exchange_id = v_inv.exchange_id AND user_id = v_user_id;

  IF v_existing_status = 'approved' THEN
    -- Ya es miembro aprobado: no consumir uso ni degradar
    RETURN jsonb_build_object('success', true, 'exchange_id', v_inv.exchange_id, 'status', 'approved', 'already_member', true);
  END IF;

  v_new_status := CASE WHEN v_exchange.requires_approval THEN 'pending' ELSE 'approved' END;

  INSERT INTO public.memberships (exchange_id, user_id, is_organizer, status)
  VALUES (v_inv.exchange_id, v_user_id, false, v_new_status)
  ON CONFLICT (exchange_id, user_id)
  DO UPDATE SET
    status = CASE
      WHEN memberships.status = 'approved' THEN 'approved'
      ELSE EXCLUDED.status
    END,
    updated_at = now();

  -- Incrementar uso
  UPDATE public.invitations
  SET uses_count = uses_count + 1
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('success', true, 'exchange_id', v_inv.exchange_id, 'status', v_new_status, 'already_member', false);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_invitation_atomic(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation_atomic(TEXT) TO authenticated, service_role;

-- 3. Aprobación / rechazo de miembros por el organizador
CREATE OR REPLACE FUNCTION public.manage_member_status(p_membership_id UUID, p_new_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_mem RECORD;
BEGIN
  IF p_new_status NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Estado de membresía inválido.');
  END IF;

  SELECT * INTO v_mem
  FROM public.memberships
  WHERE id = p_membership_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Membresía no encontrada.');
  END IF;

  IF NOT app_private.is_exchange_organizer(v_mem.exchange_id, auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo el organizador puede modificar el estado de un participante.');
  END IF;

  IF v_mem.is_organizer THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se puede modificar el rol del organizador.');
  END IF;

  UPDATE public.memberships
  SET status = p_new_status, updated_at = now()
  WHERE id = p_membership_id;

  RETURN jsonb_build_object('success', true, 'status', p_new_status);
END;
$$;
REVOKE ALL ON FUNCTION public.manage_member_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_member_status(UUID, TEXT) TO authenticated, service_role;

-- 4. Revelación atómica de asignación secreta (inmutable para el cliente)
CREATE OR REPLACE FUNCTION public.mark_assignment_revealed(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_rows_updated INT;
BEGIN
  UPDATE public.assignments
  SET revealed_at = COALESCE(revealed_at, now())
  WHERE id = p_assignment_id
    AND giver_id = auth.uid();

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Asignación no encontrada o no autorizada.');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.mark_assignment_revealed(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_assignment_revealed(UUID) TO authenticated, service_role;

-- 5. Commit atómico del sorteo con bloqueo de evento y validación exhaustiva de invariantes
CREATE OR REPLACE FUNCTION public.commit_draw(
  p_exchange_id UUID,
  p_expected_version INT,
  p_pairs JSONB,
  p_invalidation_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_exchange RECORD;
  v_approved_count INT;
  v_pair_count INT;
  v_new_version INT;
  v_new_version_id UUID;
  v_pair JSONB;
  v_giver UUID;
  v_receiver UUID;
  v_givers_set UUID[] := '{}';
  v_receivers_set UUID[] := '{}';
BEGIN
  -- 1. Bloquear y verificar evento
  SELECT * INTO v_exchange
  FROM public.exchanges
  WHERE id = p_exchange_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Intercambio no encontrado.');
  END IF;

  IF v_exchange.organizer_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo el organizador del evento puede ejecutar y registrar el sorteo.');
  END IF;

  IF v_exchange.status IN ('cancelado', 'finalizado') THEN
    RETURN jsonb_build_object('success', false, 'error', 'El intercambio se encuentra cancelado o finalizado.');
  END IF;

  IF v_exchange.current_draw_version <> p_expected_version THEN
    RETURN jsonb_build_object('success', false, 'error', 'El sorteo fue modificado concurrentemente. Por favor recarga el evento antes de continuar.');
  END IF;

  -- 2. Validar cantidad de participantes confirmados
  SELECT COUNT(*) INTO v_approved_count
  FROM public.memberships
  WHERE exchange_id = p_exchange_id AND status = 'approved';

  IF v_approved_count < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Se requieren al menos 3 participantes confirmados para sortear.');
  END IF;

  v_pair_count := jsonb_array_length(p_pairs);
  IF v_pair_count <> v_approved_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'La cantidad de asignaciones no coincide exactamente con los participantes confirmados.');
  END IF;

  -- 3. Validación exhaustiva de cada par del sorteo
  FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
  LOOP
    v_giver := (v_pair->>'giverId')::UUID;
    v_receiver := (v_pair->>'receiverId')::UUID;

    -- Invariante 1: No autoasignación
    IF v_giver = v_receiver THEN
      RETURN jsonb_build_object('success', false, 'error', 'Se detectó una autoasignación inválida en el sorteo.');
    END IF;

    -- Invariante 2: Donante debe ser miembro aprobado
    IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE exchange_id = p_exchange_id AND user_id = v_giver AND status = 'approved') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Un donante en el sorteo no es miembro aprobado del evento.');
    END IF;

    -- Invariante 3: Destinatario debe ser miembro aprobado
    IF NOT EXISTS (SELECT 1 FROM public.memberships WHERE exchange_id = p_exchange_id AND user_id = v_receiver AND status = 'approved') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Un destinatario en el sorteo no es miembro aprobado del evento.');
    END IF;

    -- Invariante 4: Ninguna exclusión violada
    IF EXISTS (SELECT 1 FROM public.exclusions WHERE exchange_id = p_exchange_id AND user_id = v_giver AND excluded_user_id = v_receiver) THEN
      RETURN jsonb_build_object('success', false, 'error', 'El sorteo viola una regla de exclusión configurada.');
    END IF;

    -- Invariante 5: Biyección (cada uno regala una vez y recibe una vez)
    IF v_giver = ANY(v_givers_set) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Un participante ha sido asignado para regalar más de una vez.');
    END IF;
    IF v_receiver = ANY(v_receivers_set) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Un participante ha sido asignado para recibir más de una vez.');
    END IF;

    v_givers_set := array_append(v_givers_set, v_giver);
    v_receivers_set := array_append(v_receivers_set, v_receiver);
  END LOOP;

  -- 4. Archivar versión previa si existía
  IF v_exchange.current_draw_version > 0 THEN
    UPDATE public.draw_versions
    SET is_active = false,
        invalidation_reason = COALESCE(p_invalidation_reason, 'Nuevo sorteo realizado por el organizador')
    WHERE exchange_id = p_exchange_id AND is_active = true;
  END IF;

  -- 5. Crear nueva versión del sorteo
  v_new_version := v_exchange.current_draw_version + 1;
  INSERT INTO public.draw_versions (exchange_id, version_number, drawn_by, is_active)
  VALUES (p_exchange_id, v_new_version, v_user_id, true)
  RETURNING id INTO v_new_version_id;

  -- 6. Insertar todas las asignaciones secretas
  FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
  LOOP
    v_giver := (v_pair->>'giverId')::UUID;
    v_receiver := (v_pair->>'receiverId')::UUID;

    INSERT INTO public.assignments (draw_version_id, exchange_id, giver_id, receiver_id)
    VALUES (v_new_version_id, p_exchange_id, v_giver, v_receiver);
  END LOOP;

  -- 7. Actualizar estado del intercambio
  UPDATE public.exchanges
  SET current_draw_version = v_new_version,
      status = 'sorteado',
      updated_at = now()
  WHERE id = p_exchange_id;

  RETURN jsonb_build_object('success', true, 'version_number', v_new_version);
END;
$$;
REVOKE ALL ON FUNCTION public.commit_draw(UUID, INT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_draw(UUID, INT, JSONB, TEXT) TO authenticated, service_role;

-- ============================================================================
-- POLÍTICAS RLS (Row Level Security en todas las tablas)
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_wish_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wish_purchases ENABLE ROW LEVEL SECURITY;

-- Profiles:
-- Cada usuario solo puede ver y editar su propio perfil completo
CREATE POLICY profiles_own ON public.profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Consents:
-- Historial inmutable de consentimientos: solo inserción y lectura propia
CREATE POLICY consents_select ON public.consents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY consents_insert ON public.consents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND terms_accepted = true AND data_consent_accepted = true);

REVOKE UPDATE, DELETE ON public.consents FROM authenticated;

-- Privacy Requests:
CREATE POLICY privacy_requests_select ON public.privacy_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY privacy_requests_insert ON public.privacy_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE UPDATE, DELETE ON public.privacy_requests FROM authenticated;

-- Exchanges:
CREATE POLICY exchanges_select ON public.exchanges
  FOR SELECT TO authenticated
  USING (app_private.is_exchange_member(id, auth.uid()) OR organizer_id = auth.uid());

CREATE POLICY exchanges_insert ON public.exchanges
  FOR INSERT TO authenticated
  WITH CHECK (organizer_id = auth.uid());

-- Actualizaciones directas permitidas solo mientras no esté sorteado/cancelado/finalizado
-- y no pueden alterar current_draw_version (gestionado por commit_draw)
CREATE POLICY exchanges_update ON public.exchanges
  FOR UPDATE TO authenticated
  USING (organizer_id = auth.uid() AND status IN ('borrador', 'inscripcion_abierta', 'inscripcion_cerrada'))
  WITH CHECK (organizer_id = auth.uid() AND status IN ('borrador', 'inscripcion_abierta', 'inscripcion_cerrada'));

-- Memberships:
-- Lectura: los participantes confirmados pueden ver a los otros miembros del intercambio; cada quien puede ver su propia fila
CREATE POLICY memberships_select ON public.memberships
  FOR SELECT TO authenticated
  USING (app_private.is_exchange_member(exchange_id, auth.uid()) OR user_id = auth.uid());

-- La inserción y actualización directa está restringida: unirse se hace por accept_invitation_atomic y aprobar por manage_member_status
REVOKE INSERT, UPDATE, DELETE ON public.memberships FROM authenticated;

-- Invitations:
-- Solo el organizador gestiona invitaciones
CREATE POLICY invitations_organizer ON public.invitations
  FOR ALL TO authenticated
  USING (app_private.is_exchange_organizer(exchange_id, auth.uid()))
  WITH CHECK (app_private.is_exchange_organizer(exchange_id, auth.uid()));

-- Exclusions:
-- Solo el organizador gestiona exclusiones (privadas)
CREATE POLICY exclusions_organizer ON public.exclusions
  FOR ALL TO authenticated
  USING (app_private.is_exchange_organizer(exchange_id, auth.uid()))
  WITH CHECK (app_private.is_exchange_organizer(exchange_id, auth.uid()));

-- Draw Versions:
-- Miembros aprobados pueden consultar el historial para verificar versiones vigentes e invalidaciones
CREATE POLICY draw_versions_select ON public.draw_versions
  FOR SELECT TO authenticated
  USING (app_private.is_exchange_member(exchange_id, auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.draw_versions FROM authenticated;

-- Assignments (REGLA FUNDAMENTAL DE PRIVACIDAD):
-- ÚNICAMENTE el que regala (giver_id) puede consultar su asignación en la versión activa.
-- Inmutable para el cliente: el cliente no puede hacer INSERT, UPDATE ni DELETE directamente.
CREATE POLICY assignments_giver_only ON public.assignments
  FOR SELECT TO authenticated
  USING (giver_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.assignments FROM authenticated;

-- Wishes:
-- El dueño puede ver y gestionar todos sus deseos personales
CREATE POLICY wishes_own ON public.wishes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- El giver asignado puede ver los deseos compartidos de su destinatario
CREATE POLICY wishes_assigned_giver ON public.wishes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.exchange_wish_selections ews
      WHERE ews.wish_id = public.wishes.id
        AND app_private.is_assigned_giver(ews.exchange_id, public.wishes.user_id, auth.uid())
    )
  );

-- Exchange Wish Selections:
-- El participante añade/elimina qué deseos comparte en el evento (debe ser dueño del deseo y miembro del intercambio)
CREATE POLICY wish_selections_select_own ON public.exchange_wish_selections
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app_private.is_assigned_giver(exchange_id, user_id, auth.uid()));

CREATE POLICY wish_selections_insert ON public.exchange_wish_selections
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND app_private.is_exchange_member(exchange_id, auth.uid())
    AND EXISTS (SELECT 1 FROM public.wishes w WHERE w.id = wish_id AND w.user_id = auth.uid())
  );

CREATE POLICY wish_selections_delete ON public.exchange_wish_selections
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND app_private.is_exchange_member(exchange_id, auth.uid())
  );

-- Wish Purchases (MARCA PRIVADA DE COMPRA):
-- ÚNICAMENTE el comprador (buyer_id = auth.uid()) puede ver y modificar su marca de compra.
-- Solo puede marcar deseos de su destinatario asignado en ese intercambio.
CREATE POLICY wish_purchases_select ON public.wish_purchases
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid());

CREATE POLICY wish_purchases_insert ON public.wish_purchases
  FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.exchange_wish_selections ews
      WHERE ews.wish_id = wish_purchases.wish_id
        AND ews.exchange_id = wish_purchases.exchange_id
        AND app_private.is_assigned_giver(wish_purchases.exchange_id, ews.user_id, auth.uid())
    )
  );

CREATE POLICY wish_purchases_delete ON public.wish_purchases
  FOR DELETE TO authenticated
  USING (buyer_id = auth.uid());
