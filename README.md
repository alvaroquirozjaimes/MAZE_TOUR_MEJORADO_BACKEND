# MAZE TOUR Backend V5

API de MAZE TOUR con Express 5, Sequelize 6 y PostgreSQL. Esta versión usa migraciones versionadas, roles almacenados en la base de datos, CSRF, sesiones PostgreSQL, auditoría administrativa, papelera y procesamiento seguro de imágenes.

## Requisitos

- Node.js 20 o superior.
- PostgreSQL 14 o superior.
- `pg_dump` y `tar` para los respaldos.
- Credenciales de Google OAuth para iniciar sesión.

## Instalación

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed-admin
npm run db:audit
npm run db:validate-fks
npm run media:migrate
npm run media:audit
npm run test:all
npm start
```

La migración `000_initial_schema.js` permite preparar una base vacía. Las siguientes migraciones actualizan una base antigua sin usar `sequelize.sync({ alter: true })`.

## Administradores

`ADMIN_EMAILS` solo sirve para sembrar administradores iniciales. Después, el acceso se controla exclusivamente mediante `Users.role`.

```env
ADMIN_EMAILS=alvaroquiroz159357@gmail.com
```

La pestaña **Usuarios** del dashboard permite asignar o retirar el rol `admin`. El sistema impide quitarte tu propio rol y también protege al último administrador.

## Comandos

```bash
npm run db:migrate          # Aplica migraciones pendientes
npm run db:migrate:status   # Muestra el estado de migraciones
npm run db:seed-admin       # Promueve correos existentes de ADMIN_EMAILS
npm run db:audit            # Detecta huérfanos, precios inválidos y autores inexistentes
npm run db:validate-fks     # Valida FKs y CHECK después de resolver datos antiguos
npm run media:migrate       # Copia archivos desde carpetas antiguas
npm run media:audit         # Detecta referencias a archivos inexistentes
npm run backup              # Respalda PostgreSQL, uploads y uploads2
npm run test:all            # Sintaxis y pruebas unitarias
```

## Despliegue seguro

1. Conserva el `.env` real del servidor.
2. No reemplaces ni elimines `storage/uploads`, `storage/uploads2` o `storage/backups`.
3. Ejecuta un respaldo antes de migrar.
4. Ejecuta migraciones de forma explícita; el servidor no modifica el esquema al iniciar.
5. Inicia o reinicia PM2 únicamente después de que las migraciones y auditorías terminen correctamente.

## Endpoints operativos

```text
GET /api/health/live
GET /api/health/ready
GET /api/health
```

`ready` comprueba PostgreSQL y responde 503 si la base no está disponible.


### Seguimiento de usuarios

La migración `003_user_registration_tracking.js` agrega `lastLoginAt` y `loginCount`. La fecha real de registro se conserva en `createdAt`; los accesos nuevos se actualizan desde Google OAuth.
