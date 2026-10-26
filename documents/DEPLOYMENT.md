# Deployment guide

How to put Ekatra on the internet for free, so anyone can open it from a link. Follow the steps in order. Total time: about 60 to 90 minutes the first time.

## The whole thing on one screen

1. **GitHub:** `git add -A`, `git commit -m "Ekatra"`, create an empty repository, `git remote add origin ...`, `git push -u origin main`.
2. **Neon:** create a free project. Copy the **pooled** string (host has `-pooler`) and the **direct** string.
3. **Secrets:** make `JWT_SECRET` and `CRON_SECRET` with `python -c "import secrets; print(secrets.token_urlsafe(48))"` (twice). Choose a `DEMO_PASSWORD`.
4. **Tables and demo data, once, from your computer:** in `backend`, set `DATABASE_URL` (pooled) and `DIRECT_DATABASE_URL` (direct), run `python -m scripts.init_db`.
5. **API on Vercel:** import the repo, Root Directory `backend`, name `ekatra-api`, variables `DATABASE_URL`, `DIRECT_DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `DEMO_PASSWORD`, `COOKIE_SECURE=true`. Check `/api/v1/health`.
6. **Website on Vercel:** import the repo again, Root Directory `frontend`, variable `VITE_API_MODE=http`. If the API address is not `https://ekatra-api.vercel.app`, change the one line in `frontend/vercel.json`.
7. **Hourly check:** in GitHub add secrets `EKATRA_API_URL` and `CRON_SECRET`; run the *hourly-check* workflow once.
8. **Verify:** sign in as `arao`; the top right must say "Live backend and database"; run `python -m scripts.run_demo_scenario --base-url <website>` and expect "All steps passed".

The sections below explain each step in full.

**What you will end up with**

| Piece | Where it runs | Cost |
|---|---|---|
| Database (PostgreSQL) | Neon | Free |
| API (the Python backend) | Vercel project number 1 (`ekatra-api`) | Free (Hobby plan) |
| Website (the screens) | Vercel project number 2 (`ekatra-web`) | Free (Hobby plan) |
| The hourly deadline check | GitHub Actions | Free |

The website sends every `/api/...` request to the API project, so the sign-in cookie stays on one address and no extra browser settings are needed.

> **Be honest with yourself about one thing.** Everything below works on your computer with a SQLite file, and all tests pass. **It has not yet been run on Neon (PostgreSQL) or on Vercel.** The first deployment is therefore also the first real test. Section 9 lists what is most likely to need a fix, and what to do about each.

---

## 0. What you need before you start

1. A **GitHub** account and **Git** installed (`git --version` should print a version).
2. A **Vercel** account (sign up with GitHub). The free "Hobby" plan is enough. Hobby is for personal, non-commercial use, which fits a hackathon.
3. A **Neon** account (neon.com). The free plan is enough. No card is needed.
4. **Python 3.12** and **Node 20 or newer** on your computer (you already use them to run the project).
5. About 10 minutes to copy values between browser tabs. Keep a notes file open; you will paste three secrets into it.

---

## 1. Put the code on GitHub

The project folder is not yet a Git repository with any saved history, so start here. In PowerShell, from the project folder (`AICTE_DASHBOARD`):

```powershell
git add -A
git status          # read the list: there must be no .env file, no ekatra.db, no node_modules
git commit -m "Ekatra prototype"
```

Then on github.com click **New repository**, name it `ekatra`, leave it empty (no README), and copy the two lines GitHub shows under "push an existing repository", which look like:

```powershell
git remote add origin https://github.com/<your-name>/ekatra.git
git push -u origin main
```

`.gitignore` already keeps out `.env`, `*.db`, `node_modules`, `dist` and the `.revert-point*` folders, so secrets and local data are not uploaded.

> Public or private? Either works. A private repository is safer while the project is unfinished. Vercel can deploy from a private repository you own.

---

## 2. Create the database on Neon

1. In Neon click **New project**. Name: `ekatra`. Region: the one closest to you (for India, Singapore is usually closest). Keep the default Postgres version.
2. On the project dashboard click **Connect**. You will see a connection string. There are **two** you need:
   - **Pooled** connection: tick "Connection pooling". The host contains `-pooler`. This is for the running API.
   - **Direct** connection: untick pooling. The host has no `-pooler`. This is for creating tables.
3. Copy both into your notes file, labelled **POOLED** and **DIRECT**. They look like `postgresql://user:password@ep-something-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.

Why two? Serverless functions open many short connections, which the pooler handles. Creating tables needs a normal connection.

---

## 3. Make two secret values

You need two long random strings. In PowerShell:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Run it twice. Put the first in your notes as **JWT_SECRET** (it signs the sign-in cookie) and the second as **CRON_SECRET** (it lets the hourly job call the API). Never commit these or paste them into chat.

Also choose a **DEMO_PASSWORD**. Every demonstration account shares it. The default is `demo`. For a public link, choose something less guessable and share it only with the people who should try the demo.

---

## 4. Create the tables and load the demonstration data (once)

This runs on your computer but writes to Neon. It creates the tables (with Alembic, the migration tool) and then loads the synthetic data.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

$env:DATABASE_URL        = "<paste POOLED here>"
$env:DIRECT_DATABASE_URL = "<paste DIRECT here>"
python -m scripts.init_db
```

Expected output ends with something like `Loading synthetic demo data: {'cases': 133, 'institutions': 66, ...}`. If you see `Database already has data`, the tables were already filled. To start again from scratch: `python -m scripts.init_db --reset`.

> If this step fails, stop and read section 9 before going further. Nothing after this works without it.

---

## 5. Deploy the API (Vercel project 1)

1. On vercel.com click **Add New, Project** and import your `ekatra` repository.
2. **Project Name**: `ekatra-api`. (The website project points at this exact name. If you choose a different name, see step 6.)
3. **Root Directory**: click Edit and choose `backend`.
4. **Framework Preset**: leave it on "Other" (or whatever Vercel detects for Python).
5. Open **Environment Variables** and add these (Production):

| Name | Value |
|---|---|
| `DATABASE_URL` | the POOLED string |
| `DIRECT_DATABASE_URL` | the DIRECT string |
| `JWT_SECRET` | from step 3 |
| `CRON_SECRET` | from step 3 |
| `DEMO_PASSWORD` | your chosen password |
| `COOKIE_SECURE` | `true` |

6. Click **Deploy**. When it finishes, open `https://<project>.vercel.app/api/v1/health`. You should see `{"ok":true,"audit":true,...}`. Also open `/api/docs` to see the interactive API documentation.

Write down the API address (for example `https://ekatra-api.vercel.app`). You need it twice more.

---

## 6. Deploy the website (Vercel project 2)

1. **Add New, Project**, import the **same** repository again.
2. **Project Name**: `ekatra-web` (any name).
3. **Root Directory**: `frontend`. Vercel detects Vite automatically (build command `npm run build`, output `dist`).
4. **Environment Variable**: `VITE_API_MODE` = `http`. This switches the screens from the built-in mock to the real API. Without it the site will look fine but show only the offline demo data.
5. **Check the API address.** Open `frontend/vercel.json`. It contains:

```json
{ "source": "/api/:path*", "destination": "https://ekatra-api.vercel.app/api/:path*" }
```

If your API project has a different address from `https://ekatra-api.vercel.app`, change that one line, commit and push.

6. Click **Deploy**, then open the website address and sign in with `arao` and your demo password.

---

## 7. Switch on the hourly deadline check

Vercel's free plan only allows one scheduled job per day, so GitHub Actions does it every hour.

1. In your GitHub repository open **Settings, Secrets and variables, Actions, New repository secret**.
2. Add `EKATRA_API_URL` = your API address (no trailing slash), and `CRON_SECRET` = the same value you gave Vercel.
3. Open the **Actions** tab, choose **hourly-check**, click **Run workflow** once. It should finish green.

The file is `.github/workflows/hourly-check.yml`. Even if the workflow is paused (GitHub pauses scheduled jobs after 60 days with no activity), the app runs the check itself whenever someone opens the dashboard and the last check is over an hour old.

---

## 8. Check that it really works

Do these in order. Each one proves a different part.

1. **Health:** `https://<api>/api/v1/health` returns `ok: true`.
2. **Sign in** on the website as `arao`. The dashboard shows numbers, and the top right says "Live backend and database", not "Mock data service".
3. **Calendar** and **Clashes** pages load with data.
4. **Book a date:** open any PGRC case, click *Book a date*, save. It appears on the Calendar.
5. **Import a file:** go to *Import records*, upload `documents/sample-data/01_pgrc_clean.csv`. You should see 6 new rows, then a receipt.
6. **Audit:** sign in as `mkhan`, open *Audit log*. The tamper check reads "passed", and your actions are listed.
7. **The scripted journey** (from your computer): 

```powershell
cd backend
python -m scripts.run_demo_scenario --base-url https://<your-website>
```

It should end with `All steps passed.`

If step 2 shows "Mock data service", `VITE_API_MODE` was not set on the website project. Add it and redeploy (Vercel, Deployments, the three dots, Redeploy).

---

## 9. If something goes wrong (most likely problems first)

| What you see | Likely cause | What to do |
|---|---|---|
| `init_db` fails on migration 0001 or 0002 | A Postgres difference from SQLite (a JSON column or the audit trigger) | Read the error line. Migration 0002 creates a trigger function (`audit_events_block_change`) that needs the Neon role to be allowed to create functions, which the default role is. If a column type is rejected, the fix is a new migration (never edit an old one) |
| API deploy fails: "no entrypoint" or module not found | Vercel did not find the FastAPI app | `backend/vercel.json` points at `app/main.py`. Make sure Root Directory is `backend`, not the repository root. If it still fails, add a file `backend/api/index.py` containing `from app.main import app` |
| API works but every page says "Failed to fetch" or 404 on `/api/...` | The website's rewrite points at the wrong API address | Fix `frontend/vercel.json` (section 6, step 5) |
| Sign-in works then you are signed out on the next click | `COOKIE_SECURE` is `true` but the site is open over plain `http` | Use the `https://` address |
| First click after a quiet period is slow (2 to 5 seconds) | Cold start of the serverless function and Neon waking up | Normal on the free plan. Open the site once before a demo to warm it |
| `Too many connections` from Postgres | The API is using the direct string | Make sure `DATABASE_URL` on the API project is the **pooled** string |
| Import of a big file fails | Vercel limits a request to about 4.5 MB | Files are capped at 2,000 rows. Split the file |
| "RB-SWR silent" warning in the data-freshness strip | This is on purpose in the demo | One unit is set to look silent to show the warning. Turn off with `SIMULATE_SOURCE_FEEDS=false`, or change `SILENT_UNITS` |

To re-run the migrations later (after a code update that adds one): set the same two environment variables as in step 4 and run `python -m alembic upgrade head` from the `backend` folder. To wipe and reload the demonstration data: `python -m scripts.init_db --reset`, or sign in as `ishaikh` and use *Reset demo data*.

---

## 10. Updating the live site

Every `git push` to `main` redeploys both projects automatically. If a change adds a database migration, run the migration command above **before** you push, so the new code never meets an old database.

---

## 11. Free-tier limits to know

| Service | Limit that matters |
|---|---|
| Vercel Hobby | Personal and non-commercial use only. Request body about 4.5 MB. One scheduled job per day (the reason for GitHub Actions) |
| Neon Free | 1 GB storage, limited compute hours a month. The database sleeps after about 5 minutes idle and wakes in under a second. Data is kept |
| GitHub Actions | Scheduled workflows pause after 60 days without repository activity. Runs can start a few minutes late |

Nothing here needs a paid service. If any limit changes, the architecture does not: any Postgres and any host that can run a FastAPI app will do.

---

## 12. Before you show it to anyone

- Change `DEMO_PASSWORD` from `demo`.
- Say clearly that **all data is synthetic** and that the site is a **prototype, not an official AICTE system**. The footer already says so.
- Do not put real complainant data into it. It has no approval for real data, and the hosting is not set up for the personal-data rules (DPDP Act) that a real deployment would need. See `06_limits_and_open_questions.md`.
- Open the site yourself 10 minutes before presenting, to warm the database and the functions.

## Running it on your own computer instead

Needs no Neon, no Vercel, no accounts. See the main `README.md`, section "Run it on your computer". In short: `python -m scripts.init_db`, then `python -m uvicorn app.main:app --port 8000` in `backend`, and `npm run dev` with `VITE_API_MODE=http` in `frontend`.
