// Nombre fijo de la cookie de sesión. Sin él, @supabase/ssr lo arma con el host de la API: el servidor
// usa localhost y el navegador la IP por la que entró, y no se encontrarían (decisión 0020).
export const COOKIE_SESION = 'sb-crm-inventaria-auth-token'
