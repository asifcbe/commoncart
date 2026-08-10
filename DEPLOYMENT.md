# Deploying CommonCart to AWS EC2 + Hostinger Domain

This guide deploys all three parts of the app onto **one EC2 instance**:

| Part | What it is | Where it lives after deploy |
|---|---|---|
| `backend/` | Node/Express API + Socket.IO | Runs as a **PM2** process on port `5001`, proxied by Nginx |
| `frontend/` | Admin app (POS, Purchases, Settings, Reports…) | Built to static files, served by Nginx at `admin.yourdomain.com` |
| `website/` | Customer-facing storefront | Built to static files, served by Nginx at `yourdomain.com` |

Database is **MongoDB Atlas** (cloud) — nothing to install on the server for that.

Layout used throughout this doc (**replace `yourdomain.com` with your real domain everywhere**):

- `https://yourdomain.com` → customer website
- `https://admin.yourdomain.com` → admin app
- `https://api.yourdomain.com` → backend API (both frontends call this)

---

## Part 1 — Launch the EC2 instance (AWS Console)

1. **AWS Console → EC2 → Launch Instance**
2. **Name**: `commoncart-prod`
3. **AMI**: Ubuntu Server 22.04 LTS (64-bit x86)
4. **Instance type**: `t3.micro` (1 vCPU/1GB). This is tight for Node + Nginx + PM2 + Certbot running together — **Part 3 adds a swap file** to prevent out-of-memory kills. If the app feels sluggish or PM2 shows repeated restarts under load later, resizing to `t3.small` is a straightforward upgrade (stop instance → change instance type → start).
5. **Key pair**: Create new → download the `.pem` file → **keep it safe, you cannot re-download it**
6. **Network settings → Edit security group**, add inbound rules:
   | Type | Port | Source |
   |---|---|---|
   | SSH | 22 | My IP (not 0.0.0.0/0 — lock this to your own IP) |
   | HTTP | 80 | Anywhere (0.0.0.0/0) |
   | HTTPS | 443 | Anywhere (0.0.0.0/0) |
7. **Storage**: 20 GB gp3 minimum (more if you expect lots of product images in `backend/uploads/`)
8. **Launch instance**
9. Go to the instance's page → **Allocate an Elastic IP** (EC2 → Elastic IPs → Allocate → Associate with your instance)
   - **Do this before setting up DNS.** Elastic IP = a static IP that survives stop/start — without it, every instance stop/start gives you a new IP and breaks DNS.
   - Note this IP down — you'll point all three DNS records at it.

---

## Part 2 — Point Hostinger DNS at the EC2 instance

In Hostinger: **hPanel → Domains → yourdomain.com → DNS / Nameservers → DNS Records**

Add three `A` records, all pointing to the **Elastic IP** from Part 1:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `@` | `<Elastic IP>` | 300 (or default) |
| A | `admin` | `<Elastic IP>` | 300 |
| A | `api` | `<Elastic IP>` | 300 |

DNS propagation can take a few minutes to a few hours. Check with:
```bash
dig +short yourdomain.com
dig +short admin.yourdomain.com
dig +short api.yourdomain.com
```
All three should return your Elastic IP before you continue to SSL in Part 6.

---

## Part 3 — Connect to the instance and install prerequisites

```bash
chmod 400 ~/Downloads/commoncart-prod.pem
ssh -i ~/Downloads/commoncart-prod.pem ubuntu@<Elastic IP>
```

Once connected, run:

```bash
# System update
sudo apt update && sudo apt upgrade -y
```

**Add a 2GB swap file** — on a `t3.micro` (1GB RAM), this is what stops the backend or an `npm install`/build from being OOM-killed under memory pressure. Do this before installing anything else:
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # persists across reboots
free -h   # confirm "Swap:" line shows ~2.0Gi
```

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # confirm v20.x
npm -v

# Build tools some npm packages (sharp, bcrypt) need to compile native bindings
sudo apt install -y build-essential python3

# PM2 — keeps the backend running, restarts it on crash/reboot
sudo npm install -g pm2

# Nginx — reverse proxy + static file server for the two frontends
sudo apt install -y nginx

# Git
sudo apt install -y git

# Certbot — free SSL certs from Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
```

---

## Part 4 — Get the code onto the server

**Option A — clone from your Git remote (recommended):**
```bash
cd ~
git clone <your-repo-url> commoncart
cd commoncart
```

**Option B — no Git remote yet, upload from your Mac instead:**
```bash
# Run this on your MAC, not the server
cd "/Users/apple/Desktop/MyWorkspace/Official Projects/CommonCart"
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.git' \
  -e "ssh -i ~/Downloads/commoncart-prod.pem" \
  ./ ubuntu@<Elastic IP>:~/commoncart/
```

Either way, you should end up with `~/commoncart/backend`, `~/commoncart/frontend`, `~/commoncart/website` on the server.

---

## Part 5 — Configure and build each part

### 5a. Backend

```bash
cd ~/commoncart/backend
npm install --production
```

Create the production `.env` (do **not** commit this file):
```bash
nano .env
```
```env
PORT=5001
MONGODB_URI=<your Atlas connection string>
JWT_SECRET=<generate a new long random string — do not reuse the dev one>
JWT_EXPIRES_IN=7d
CLIENT_URL=https://admin.yourdomain.com
CLIENT_URLS=https://yourdomain.com,https://admin.yourdomain.com
UPLOAD_DIR=uploads
```
Generate a strong `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**MongoDB Atlas — allow the EC2 instance to connect:**
Atlas dashboard → your cluster → **Network Access → Add IP Address** → add the EC2 instance's Elastic IP (not 0.0.0.0/0 — keep this scoped to your server's IP).

Start the backend under PM2:
```bash
cd ~/commoncart/backend
pm2 start server.js --name commoncart-api
pm2 save
```

`pm2 save` snapshots the process list. Part 8 covers making PM2 itself survive a reboot.

> **On `t3.micro`:** the `frontend`/`website` Vite builds bundle several heavy libraries (`jspdf`, `xlsx`, `html2canvas`) and can briefly need more memory than 1GB alone provides. The swap file from Part 3 covers this — if a build still gets killed (check with `dmesg | tail -20` for an "Out of memory" line), rerun it as `NODE_OPTIONS=--max-old-space-size=768 npm run build` to cap Node's heap and force it to lean on swap instead of crashing.

### 5b. Admin frontend (`frontend/`)

```bash
cd ~/commoncart/frontend
npm install
```

The app calls a relative `/api` path (see `src/utils/api.js`), which works as long as Nginx proxies `/api` on the **same host** to the backend — so no `VITE_API_URL` env var is needed. Just build:
```bash
npm run build
```
This produces `~/commoncart/frontend/dist/` — the static admin app.

### 5c. Customer website (`website/`)

```bash
cd ~/commoncart/website
npm install
npm run build
```
This produces `~/commoncart/website/dist/`.

---

## Part 6 — Configure Nginx (reverse proxy + static hosting)

Create three server blocks — one per subdomain.

```bash
sudo nano /etc/nginx/sites-available/commoncart
```

Paste (this is the **HTTP-only** version; Certbot will add the HTTPS blocks automatically in the next step):

```nginx
# ── Customer website: yourdomain.com ──
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    root /home/ubuntu/commoncart/website/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:5001;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # React Router — serve index.html for any unmatched path
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# ── Admin app: admin.yourdomain.com ──
server {
    listen 80;
    server_name admin.yourdomain.com;
    root /home/ubuntu/commoncart/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:5001;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# ── Backend API (direct access): api.yourdomain.com ──
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> Note: both frontends proxy `/api` to the backend **on their own subdomain** (so `admin.yourdomain.com/api/...` and `yourdomain.com/api/...` both work without CORS issues, since same-origin). The `api.yourdomain.com` block exists for direct API access/testing/webhooks — the frontends don't need to know about it since they call `/api` relatively.

Enable the site and verify config:
```bash
sudo ln -s /etc/nginx/sites-available/commoncart /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # remove the default placeholder site
sudo nginx -t
sudo systemctl restart nginx
```

At this point `http://yourdomain.com`, `http://admin.yourdomain.com` should load over plain HTTP. Confirm before moving to SSL.

---

## Part 7 — SSL certificates (HTTPS) via Let's Encrypt

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d admin.yourdomain.com -d api.yourdomain.com
```

Certbot will:
- Ask for an email (for renewal reminders)
- Ask to agree to terms
- Automatically rewrite `/etc/nginx/sites-available/commoncart` to add `listen 443 ssl` blocks and redirect HTTP → HTTPS

Confirm auto-renewal is set up (Certbot installs this automatically on Ubuntu, but verify):
```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

**Now go back and update the backend `.env`** to use `https://` everywhere (you set it to `https://` already in Part 5a if you followed along — if not, edit it now) and restart:
```bash
cd ~/commoncart/backend
pm2 restart commoncart-api
```

Visit `https://yourdomain.com` and `https://admin.yourdomain.com` — both should load with a padlock. Log into the admin app and confirm POS/Products/Settings all load data (proves the `/api` proxy + Atlas connection are working end-to-end).

---

## Part 8 — Make everything survive a reboot

Two things need to auto-start after the instance restarts: **PM2** (for the backend) and **Nginx** (already enabled by default on Ubuntu, but verify).

```bash
# PM2 startup script — run once
pm2 startup systemd -u ubuntu --hp /home/ubuntu
# This prints a command starting with "sudo env PATH=..." — copy-paste and run THAT exact line it gives you

# Save the current process list so PM2 knows what to relaunch
pm2 save

# Confirm Nginx is enabled (should already say "enabled")
sudo systemctl is-enabled nginx
sudo systemctl enable nginx   # if it printed "disabled"
```

After this, **you don't need to do anything manually when the EC2 instance restarts** (stop/start from the AWS console, a reboot, or an unexpected crash) — PM2 relaunches the backend and Nginx serves the frontends automatically, both on system boot.

---

## What to do when you restart the EC2 instance

**If you just reboot the instance (`sudo reboot`, or stop/start from AWS Console) and completed Part 8:** nothing — everything comes back on its own within a minute or two. Just verify:

```bash
ssh -i ~/Downloads/commoncart-prod.pem ubuntu@<Elastic IP>
pm2 status              # commoncart-api should show "online"
sudo systemctl status nginx   # should show "active (running)"
curl -I https://yourdomain.com
curl -I https://admin.yourdomain.com
curl -I https://api.yourdomain.com/api/auth/me   # 401 is fine here — it proves the API responded
```

**If something didn't come back up:**
```bash
pm2 restart commoncart-api
pm2 logs commoncart-api --lines 50    # check for errors (e.g. Atlas IP allowlist, bad .env)
sudo systemctl restart nginx
sudo nginx -t                          # check for a config typo
```

**Important — Elastic IP persists automatically.** Because you allocated an Elastic IP in Part 1 and associated it with the instance, stopping and starting the instance from the AWS Console **keeps the same public IP**, so DNS never breaks. (This is only true for Elastic IPs — if you ever launch a *new* instance instead of restarting this one, you must re-associate the Elastic IP to it, or DNS will point at the old, now-wrong IP.)

**If you stopped the instance for a long time and Atlas or Let's Encrypt flagged anything:**
- Atlas Network Access list doesn't expire, so no action needed there.
- Let's Encrypt certs auto-renew via the `certbot.timer` systemd job (checks twice daily, renews when <30 days left) — but that timer only runs while the instance is up. If the instance was stopped for months, run `sudo certbot renew` manually once after restarting to catch up.

---

## Deploying a new code change (after initial setup)

```bash
ssh -i ~/Downloads/commoncart-prod.pem ubuntu@<Elastic IP>
cd ~/commoncart
git pull                     # or re-run the rsync from Part 4 if not using Git

# Backend changed?
cd backend && npm install --production && pm2 restart commoncart-api

# Admin frontend changed?
cd ../frontend && npm install && npm run build   # Nginx serves the new dist/ immediately, no restart needed

# Website changed?
cd ../website && npm install && npm run build
```

Nginx serves whatever is currently in each `dist/` folder — a fresh `npm run build` is all that's needed for frontend changes to go live; no Nginx restart required (only needed if you edit the Nginx config itself).

---

## Quick reference — where things live

| What | Where |
|---|---|
| Backend process | `pm2 status` / `pm2 logs commoncart-api` |
| Backend `.env` | `~/commoncart/backend/.env` |
| Backend uploaded images | `~/commoncart/backend/uploads/` — **back this up separately**, it's not in Atlas |
| Nginx config | `/etc/nginx/sites-available/commoncart` |
| Nginx logs | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` |
| Admin app build | `~/commoncart/frontend/dist/` |
| Website build | `~/commoncart/website/dist/` |
| SSL certs | `/etc/letsencrypt/live/yourdomain.com/` (managed by Certbot, don't touch manually) |

## Backing up `backend/uploads/` (product images)

These are **not** in MongoDB Atlas — they're plain files on the EC2 disk. Losing the instance loses them unless backed up. Simplest approach, run periodically (or cron it):
```bash
# From your Mac
rsync -avz -e "ssh -i ~/Downloads/commoncart-prod.pem" \
  ubuntu@<Elastic IP>:~/commoncart/backend/uploads/ \
  ~/commoncart-uploads-backup/
```
For a more permanent fix later, consider moving uploads to S3 — out of scope for this initial deployment.
