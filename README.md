<<<<<<< HEAD
# AgriMovers (prototype)

This repository contains a prototype Node.js + Express backend and simple static front-end pages for the AgriMovers logistics platform.

## What I added
- `package.json` — scripts (`start`, `dev`) and dependencies updated.
- `.env.example` — copy to `.env` and fill in secrets.
- `db/schema.sql` — SQL to create the database and required tables.
- `README.md` — this file with setup and run instructions.

## Quick setup (Windows PowerShell)

1. Install Node.js (LTS recommended) and MySQL.

2. Clone or open this repo and install dependencies:

```powershell
npm install
```

3. Create the database and tables. In a MySQL client run:

```sql
-- from repository root
source db/schema.sql;
```

Or copy the contents of `db/schema.sql` into your MySQL client.

4. Configure environment variables:

Copy `.env.example` to `.env` and set values (DB credentials, session secret, port):

```powershell
copy .env.example .env
# then edit .env in your editor and update DB credentials
```

5. Start the server:

```powershell
npm start
# or for development with automatic reload (requires nodemon):
npm run dev
```

6. Open browser: http://localhost:3000 (or the port you configured) and use the UI pages in `public/`.

## Notes and next steps
- The server uses session-based auth and stores uploads in `public/uploads`.
- The SQL schema creates `users`, `transport_requests`, and `notifications` tables used by `server.js`.
- You should set a strong `SESSION_SECRET` in `.env` before using in production.
- For production deploy: set up a managed MySQL instance, configure SSL, use a process manager (PM2) or container, and place static assets behind a CDN.

If you'd like, I can also:
- Build a small React front-end (single-page) replacing static pages.
- Add API documentation (Swagger / OpenAPI) for the backend.
- Add tests for routes and a lightweight seed script for demo users.

### Running the seed and DB checks (PowerShell note)

If `npm run seed` fails in PowerShell with an execution policy error ("npm.ps1 cannot be loaded"), you can run the seed directly using `node` which bypasses the PowerShell npm wrapper.

Run the seed directly:

```powershell
# from project root
node scripts/seed.js
```

Quick DB connectivity test (returns MySQL server version on success):

```powershell
node scripts/check-db.js
```

If you prefer to keep using `npm` in PowerShell, you can change the execution policy (one-time) by running PowerShell as Administrator and executing:

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Only change execution policy if you understand the security implications — `RemoteSigned` is a common setting for development machines.
=======
# AgriMovers3
>>>>>>> 6f64775de71f8972091d5224a394be4ec294b5c9
