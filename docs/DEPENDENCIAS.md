# Dependencias y avisos de seguridad

Análisis del 2 de noviembre de 2026 con Node 24.22.1 / npm 11.19.1 (`npm ci` falla con npm 10 por diferencias del lockfile; el repositorio declara Node 24 en `.nvmrc` y `engines`).

## Resultado

`npm audit --omit=dev` antes de esta revisión: 16 avisos (1 crítico, 4 altos, 5 moderados, 6 bajos). Después de actualizar `vite` de 8.3.0 a 8.3.5: 15 (1 crítico, 3 altos, 5 moderados, 6 bajos). No se usó `npm audit fix --force` ni `overrides`: ambos instalarían versiones fuera de los rangos que declaran `@neondatabase/auth` y `vinext`, sin una corrección publicada por esos paquetes.

## Clasificación por dónde se ejecuta el código

Se buscaron las firmas de cada paquete en el bundle de Workers (`.cloudflare/output/v0/workers/default/bundle`) y en los recursos del navegador.

| Paquete (vía) | Severidad | ¿Se ejecuta en Papelito? | Decisión |
| --- | --- | --- | --- |
| `better-auth` < 1.7.7 (vía `@neondatabase/auth` 0.6.0-beta, que fija 1.7.6). GHSA-965c-763c-88jm «OAuth state … sign in as another user», GHSA-r4xp-prcw-77qf «OAuth Proxy …» | Crítica / alta | **No en el Worker.** El bundle contiene solo las rutas del SDK (`sign-in/magic-link` como texto); no hay endpoints de servidor de Better Auth (`better-call`, `oAuthProxy`). El código vulnerable corre en el **servicio gestionado de Neon Auth**. | Pendiente externo: confirmar con Neon que el servicio usa Better Auth ≥ 1.7.7. Actualizar el SDK cuando publique una versión con ese rango (la última, `0.7.0-beta`, sigue fijando 1.7.6). Actualizar solo el SDK **no** resuelve el servicio. |
| `@better-auth/drizzle-adapter` | Baja | No (adaptador de base de datos del servidor de Better Auth) | Igual que el anterior |
| `zod` < 4.6.6 (vía `@neondatabase/auth`) | Alta | Solo en un chunk del navegador; valida datos del propio usuario | Riesgo bajo; se corrige al actualizar el SDK |
| `vite` 8.3.0–8.3.2 | Alta | No: herramienta de compilación y servidor de desarrollo | **Actualizado a 8.3.5** (compatible con `vinext ^8`, `@cloudflare/vite-plugin ^7 || ^8`, `@vitejs/plugin-rsc *`) |
| `fflate` (vía `@vercel/og` → `vinext`) | Moderada | No aparece en el bundle; Papelito no genera imágenes OG | Esperar una versión de `vinext` que lo actualice (1.4.1 todavía usa `@vercel/og` 1.0.3) |
| `deepmerge`, `html-to-text`, `@react-email/*` (vía `@neondatabase/auth-ui`) | Baja | No aparece en el bundle (plantillas de correo de la librería de UI) | Esperar al SDK |

## Mantenimiento

- Dependabot (`.github/dependabot.yml`) propone cada lunes las actualizaciones de npm (agrupando menores y parches) y de las acciones de GitHub. Toda propuesta pasa por `verify`.
- Repetir este análisis después de cada actualización de `@neondatabase/auth` o `vinext`:

```bash
npm audit --omit=dev
```
