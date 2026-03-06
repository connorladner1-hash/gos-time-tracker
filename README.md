# GOS Time Tracker — Deployment Guide

## What This Is
A Progressive Web App (PWA) for Gulf Office Systems employees to track:
- Daily clock in / clock out
- Lunch breaks (30 min, 1 hour, or custom)
- Travel time and mileage
- Pay period summaries with CSV export

---

## Deploy to Vercel (FREE — Takes ~5 Minutes)

### Step 1 — Push to GitHub
1. Create a free account at github.com
2. Create a new repository called `gos-time-tracker`
3. Upload all the files from this folder to that repo

### Step 2 — Deploy on Vercel
1. Go to **vercel.com** and sign in with your GitHub account
2. Click **"Add New Project"**
3. Select your `gos-time-tracker` repo
4. Vercel auto-detects Vite — just click **"Deploy"**
5. Your app will be live at: `https://gos-time-tracker.vercel.app`

---

## Install on Employee Phones

### iPhone (Safari):
1. Open the app URL in Safari
2. Tap the **Share** button (box with arrow)
3. Tap **"Add to Home Screen"**
4. Tap **"Add"**
→ App icon appears on home screen like a native app!

### Android (Chrome):
1. Open the app URL in Chrome
2. Tap the **three-dot menu**
3. Tap **"Add to Home Screen"** or **"Install App"**
→ App icon appears on home screen!

---

## Customizing Employees
Open `src/App.jsx` and find the `EMPLOYEES` array near the top.
Add or remove names, then redeploy to Vercel (auto-deploys on GitHub push).

## Admin Panel
- Access via the "Admin" button on the home screen
- Default PIN: **1234** (change in `src/App.jsx` — search for `"1234"`)
- Download pay period CSV to attach to email

## Notes
- Data is saved on each employee's phone (localStorage)
- Each phone is independent — no server sync
- For multi-device sync, a backend database would be needed (future upgrade)
