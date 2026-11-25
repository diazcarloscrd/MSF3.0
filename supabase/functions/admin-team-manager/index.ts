import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProfileRow {
  user_id: string;
  username: string;
  full_name: string;
  role: "admin" | "captador";
  is_active: boolean;
  created_at?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function resolveServiceRoleKey(): string {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (legacyKey) return legacyKey;

  try {
    const rawSecretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!rawSecretKeys) return "";
    const parsed = JSON.parse(rawSecretKeys) as { default?: unknown };
    return typeof parsed?.default === "string" ? parsed.default : "";
  } catch {
    return "";
  }
}

function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");

  if (normalized.length < 2 || normalized.length > 64) return null;
  if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(normalized)) return null;
  return normalized;
}

function normalizeRole(
  raw: unknown,
  defaultRole?: "admin" | "captador",
): "admin" | "captador" | null {
  if (raw === undefined || raw === null || raw === "") {
    return defaultRole ?? null;
  }
  if (raw === "admin" || raw === "ADMIN") return "admin";
  if (raw === "captador" || raw === "COLLECTOR") return "captador";
  return null;
}

function deriveEmail(username: string, rawEmail: unknown): string | null {
  if (rawEmail === undefined || rawEmail === null || rawEmail === "") {
    return `${username}@msfc-user.invalid`;
  }
  if (typeof rawEmail !== "string") return null;
  const cleaned = rawEmail.trim().toLowerCase();
  if (!cleaned) return `${username}@msfc-user.invalid`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) return null;
  return cleaned;
}

function isValidUuid(val: unknown): val is string {
  return (
    typeof val === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = resolveServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Configuración del servidor incompleta." }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const token = bearerMatch?.[1]?.trim() ?? "";

  if (!token) {
    return jsonResponse({ error: "Se requiere token de autenticación." }, 401);
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) {
    return jsonResponse({ error: "Sesión inválida o expirada." }, 401);
  }

  const { data: callerProfile, error: callerErr } = await supabaseAdmin
    .from("profiles")
    .select("user_id, username, full_name, role, is_active")
    .eq("user_id", authData.user.id)
    .maybeSingle<ProfileRow>();

  if (callerErr) {
    return jsonResponse({ error: "No se pudo verificar el perfil del administrador." }, 500);
  }

  if (!callerProfile || !callerProfile.is_active || callerProfile.role !== "admin") {
    return jsonResponse(
      { error: "Acceso denegado: se requiere cuenta de administrador activa." },
      403,
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse({ error: "Cuerpo JSON inválido." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Cuerpo JSON inválido." }, 400);
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (action === "create_member") {
    const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
    if (fullName.length < 2 || fullName.length > 120) {
      return jsonResponse(
        { error: "El nombre completo debe tener entre 2 y 120 caracteres." },
        400,
      );
    }

    const username = normalizeUsername(body.username);
    if (!username) {
      return jsonResponse(
        {
          error:
            "El usuario debe tener al menos 2 caracteres alfanuméricos (se permiten . _ -).",
        },
        400,
      );
    }

    const email = deriveEmail(username, body.email);
    if (!email) {
      return jsonResponse({ error: "El formato del correo electrónico no es válido." }, 400);
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8) {
      return jsonResponse(
        { error: "La contraseña debe tener al menos 8 caracteres." },
        400,
      );
    }

    const role = normalizeRole(body.role, "captador");
    if (!role) {
      return jsonResponse({ error: "Rol inválido. Debe ser admin o captador." }, 400);
    }

    let isActive = true;
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== "boolean") {
        return jsonResponse({ error: "El campo is_active debe ser booleano." }, 400);
      }
      isActive = body.is_active;
    }

    const { data: existingProfile, error: existingErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("username", username)
      .maybeSingle();

    if (existingErr) {
      return jsonResponse({ error: "No se pudo verificar disponibilidad del usuario." }, 500);
    }

    if (existingProfile) {
      return jsonResponse({ error: "Ya existe un integrante con ese nombre de usuario." }, 409);
    }

    const { data: createdAuth, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, full_name: fullName },
      ...(isActive ? {} : { ban_duration: "876000h" }),
    });

    if (createAuthErr || !createdAuth?.user) {
      const msg = (createAuthErr?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
        return jsonResponse(
          { error: "Ya existe una cuenta registrada con ese correo o usuario." },
          409,
        );
      }
      return jsonResponse({ error: "No se pudo crear la cuenta de autenticación." }, 500);
    }

    const newUserId = createdAuth.user.id;

    const { data: insertedProfile, error: insertProfileErr } = await supabaseAdmin
      .from("profiles")
      .insert({
        user_id: newUserId,
        username,
        full_name: fullName,
        role,
        is_active: isActive,
      })
      .select("user_id, username, full_name, role, is_active, created_at")
      .single<ProfileRow>();

    if (insertProfileErr || !insertedProfile) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      if (insertProfileErr?.code === "23505") {
        return jsonResponse({ error: "Ya existe un integrante con ese usuario." }, 409);
      }
      return jsonResponse({ error: "No se pudo crear el perfil del integrante." }, 500);
    }

    const { error: auditErr } = await supabaseAdmin.from("audit_log").insert({
      actor_id: callerProfile.user_id,
      actor_name: callerProfile.full_name,
      entity_type: "profile",
      entity_id: insertedProfile.user_id,
      action: "USER_ADMIN",
      old_data: null,
      new_data: {
        user_id: insertedProfile.user_id,
        username: insertedProfile.username,
        full_name: insertedProfile.full_name,
        role: insertedProfile.role,
        is_active: insertedProfile.is_active,
        email,
      },
      summary: `Creó integrante ${insertedProfile.full_name} (@${insertedProfile.username}, ${insertedProfile.role}, ${insertedProfile.is_active ? "activo" : "inactivo"})`,
    });

    if (auditErr) {
      console.error("Error registrando audit_log en create_member:", auditErr);
    }

    return jsonResponse({ ok: true, action: "create_member", member: insertedProfile }, 200);
  }

  if (action === "update_member") {
    const userId = body.user_id;
    if (!isValidUuid(userId)) {
      return jsonResponse({ error: "ID de integrante inválido." }, 400);
    }

    const hasFullName = body.full_name !== undefined;
    const hasRole = body.role !== undefined;
    const hasIsActive = body.is_active !== undefined;

    if (!hasFullName && !hasRole && !hasIsActive) {
      return jsonResponse(
        { error: "Debés indicar al menos un campo para actualizar (nombre, rol o estado)." },
        400,
      );
    }

    const { data: oldProfile, error: oldErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, username, full_name, role, is_active, created_at")
      .eq("user_id", userId)
      .maybeSingle<ProfileRow>();

    if (oldErr) {
      return jsonResponse({ error: "No se pudo consultar el perfil del integrante." }, 500);
    }

    if (!oldProfile) {
      return jsonResponse({ error: "Integrante no encontrado." }, 404);
    }

    const patch: Partial<Pick<ProfileRow, "full_name" | "role" | "is_active">> = {};

    if (hasFullName) {
      const trimmed = typeof body.full_name === "string" ? body.full_name.trim() : "";
      if (trimmed.length < 2 || trimmed.length > 120) {
        return jsonResponse(
          { error: "El nombre completo debe tener entre 2 y 120 caracteres." },
          400,
        );
      }
      patch.full_name = trimmed;
    }

    if (hasRole) {
      const normalizedRole = normalizeRole(body.role);
      if (!normalizedRole) {
        return jsonResponse({ error: "Rol inválido. Debe ser admin o captador." }, 400);
      }
      patch.role = normalizedRole;
    }

    if (hasIsActive) {
      if (typeof body.is_active !== "boolean") {
        return jsonResponse({ error: "El campo is_active debe ser booleano." }, 400);
      }
      patch.is_active = body.is_active;
    }

    const nextIsActive = patch.is_active ?? oldProfile.is_active;
    const nextRole = patch.role ?? oldProfile.role;

    if (userId === callerProfile.user_id && (!nextIsActive || nextRole !== "admin")) {
      return jsonResponse(
        {
          error:
            "No podés desactivar ni quitar el rol de administrador a tu propia cuenta.",
        },
        400,
      );
    }

    const { data: updatedProfile, error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("user_id", userId)
      .select("user_id, username, full_name, role, is_active, created_at")
      .single<ProfileRow>();

    if (updateErr || !updatedProfile) {
      return jsonResponse({ error: "No se pudo actualizar el perfil del integrante." }, 500);
    }

    const authUpdate: {
      ban_duration?: string;
      user_metadata?: { username: string; full_name: string };
    } = {};

    if (hasIsActive) {
      authUpdate.ban_duration = updatedProfile.is_active ? "none" : "876000h";
    }
    if (hasFullName) {
      authUpdate.user_metadata = {
        username: updatedProfile.username,
        full_name: updatedProfile.full_name,
      };
    }

    if (Object.keys(authUpdate).length > 0) {
      const { error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        authUpdate,
      );
      if (authUpdateErr) {
        await supabaseAdmin
          .from("profiles")
          .update({
            full_name: oldProfile.full_name,
            role: oldProfile.role,
            is_active: oldProfile.is_active,
          })
          .eq("user_id", userId);
        return jsonResponse(
          { error: "No se pudo sincronizar la cuenta de autenticación." },
          500,
        );
      }
    }

    const changeParts: string[] = [];
    if (oldProfile.full_name !== updatedProfile.full_name) {
      changeParts.push(`nombre "${oldProfile.full_name}" -> "${updatedProfile.full_name}"`);
    }
    if (oldProfile.role !== updatedProfile.role) {
      changeParts.push(`rol ${oldProfile.role} -> ${updatedProfile.role}`);
    }
    if (oldProfile.is_active !== updatedProfile.is_active) {
      changeParts.push(updatedProfile.is_active ? "reactivó cuenta" : "desactivó cuenta");
    }

    const summary =
      changeParts.length > 0
        ? `Actualizó integrante @${updatedProfile.username}: ${changeParts.join(", ")}`
        : `Actualizó integrante @${updatedProfile.username} sin cambios de atributos`;

    const { error: auditErr } = await supabaseAdmin.from("audit_log").insert({
      actor_id: callerProfile.user_id,
      actor_name: callerProfile.full_name,
      entity_type: "profile",
      entity_id: userId,
      action: "USER_ADMIN",
      old_data: oldProfile,
      new_data: updatedProfile,
      summary,
    });

    if (auditErr) {
      console.error("Error registrando audit_log en update_member:", auditErr);
    }

    return jsonResponse({ ok: true, action: "update_member", member: updatedProfile }, 200);
  }

  if (action === "reset_password") {
    const userId = body.user_id;
    if (!isValidUuid(userId)) {
      return jsonResponse({ error: "ID de integrante inválido." }, 400);
    }

    const rawPassword = body.password ?? body.new_password;
    const password = typeof rawPassword === "string" ? rawPassword : "";
    if (password.length < 8) {
      return jsonResponse(
        { error: "La nueva contraseña debe tener al menos 8 caracteres." },
        400,
      );
    }

    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, username, full_name, role, is_active")
      .eq("user_id", userId)
      .maybeSingle<ProfileRow>();

    if (targetErr) {
      return jsonResponse({ error: "No se pudo consultar el integrante." }, 500);
    }

    if (!targetProfile) {
      return jsonResponse({ error: "Integrante no encontrado." }, 404);
    }

    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
    });

    if (pwErr) {
      return jsonResponse({ error: "No se pudo restablecer la contraseña." }, 500);
    }

    const { error: auditErr } = await supabaseAdmin.from("audit_log").insert({
      actor_id: callerProfile.user_id,
      actor_name: callerProfile.full_name,
      entity_type: "profile",
      entity_id: userId,
      action: "USER_ADMIN",
      old_data: {
        user_id: targetProfile.user_id,
        username: targetProfile.username,
      },
      new_data: {
        user_id: targetProfile.user_id,
        username: targetProfile.username,
        password_reset: true,
      },
      summary: `Restableció contraseña de ${targetProfile.full_name} (@${targetProfile.username})`,
    });

    if (auditErr) {
      console.error("Error registrando audit_log en reset_password:", auditErr);
    }

    return jsonResponse({ ok: true, action: "reset_password", user_id: userId }, 200);
  }

  return jsonResponse({ error: "Acción no soportada." }, 400);
});
