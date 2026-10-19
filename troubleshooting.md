# Troubleshooting log

Every problem, error, or blocker we hit, and how we solved it. Newest at the bottom.

Status: ✅ solved · 🟡 workaround known · 🔴 open

Each entry: **Problem**, **Cause**, **Fix**, **Status**.

---

### T1: Dashboard dev server crashes on startup (`ENOSPC`)
- **Problem:** `npm run dev` crashed with an `ENOSPC` error (the operating system ran out of file-watch slots).
- **Cause:** Vite (the dev server) was watching every file in the repo, including the Unity project, whose `Library/` folder alone is about 3 GB.
- **Fix:** `vite.config.js` now ignores `unity/`, `python_backend/`, `dataset/`, `models/` and `dist/`.
- **Status:** ✅ solved in the working copy; **not committed yet**.

### T2: Wrong Node.js version for the dashboard
- **Problem:** the default Node is v16.20.2, but Vite 7 needs Node 20.19 or newer.
- **Cause:** older Node installed as the default.
- **Fix:** run `nvm use 20` first (v20.20.2 is already installed).
- **Status:** 🟡 workaround known; not yet re-tested by running the dashboard.

### T3: React 3D heart will not load on a fresh copy of the repo
- **Problem:** `public/Heart.fbx` and `public/beating-heart.glb` are excluded from git.
- **Cause:** `.gitignore` excludes them (they are large). `Heart.fbx` is not stored anywhere in git; only the `.glb` is, inside the Unity folder.
- **Fix:** not chosen yet. Options are to commit the files or to show a fallback shape when the file is missing.
- **Status:** 🔴 open. It matters because the challenge repo must work when a judge downloads it.

### T4: One patient is not enough to train a prediction model
- **Problem:** our single recording has very few dangerous moments (blood pressure dipped below 70 in only 6 short episodes).
- **Cause:** it is one surgery patient.
- **Fix:** train on many patients from an open dataset. Which dataset and which danger depends on Steps 1–2.
- **Status:** 🟡 Step 1 is done (D5); the actual fix (many patients) happens in Step 2.

### T5: Unclear permission to publish the dataset
- **Problem:** the dataset is committed, the repo must be public, and we did not know the data licence.
- **Cause:** the file only said it came from a collection called PulseDB, which mixes two sources with different rules.
- **Fix:** we matched the file to **VitalDB case 6198** (age, sex, height, weight, and BMI are identical). VitalDB is listed as CC BY 4.0 on AWS and PhysioNet.
- **Status:** ✅ solved. Still to do: credit the VitalDB paper in the README and check the vitaldb.net sign-up agreement.

### T6: Command failed with "No such file or directory"
- **Problem:** `ls` on a `unity/...` path failed.
- **Cause:** the shell was still inside `python_backend/` from the previous command, so the relative path was wrong.
- **Fix:** use full absolute paths in commands.
- **Status:** ✅ solved.

### T7: Old documentation contradicts the code
- **Problem:** `HANDOFF.md` describes things the code no longer does (random noise on blood pressure, the old flow formula). Smaller slips exist too, such as the README's time-constant figure (1.72 s, should be 1.60 s).
- **Cause:** the project was audited and corrected after `HANDOFF.md` was written.
- **Fix:** not done. Rewrite or delete `HANDOFF.md` and fix the README before submission.
- **Status:** 🔴 open.

### T8: No open data to forecast a heart attack
- **Problem:** we wanted a more serious target than a blood pressure crash, such as a heart attack (*myocardial infarction*).
- **Cause:** VitalDB has 34 blood-test types but none that measure heart-muscle damage, and only 57 of 6,388 patients died in hospital. The free heart-attack ECG set (PTB-XL) is made of 10-second snapshots labelled "has or had a heart attack", which is detection, not forecasting. Hospital databases with real outcomes need an approval process.
- **Fix:** keep the blood pressure crash as the target and add severity levels (D5, D6).
- **Status:** ✅ solved by changing the target.

### T9: "Deadlier" and heart-scan datasets do not fit our patients
- **Problem:** we looked for a deadlier outcome or a scan-based (MRI/CT) angle.
- **Cause:**
  - Sepsis is not a heart disease.
  - The heart-failure set has only 299 patients, static numbers, and no live signal.
  - The full eICU database needs an approval that can take days.
  - Scan datasets (ACDC, COCA) are different patients from our signal data. Only UK Biobank pairs scans with ECG, and it needs a formal application.
  - This machine has no graphics card (GPU), which 3D scan models normally need.
- **Fix:** none of these is used. Scans go on the "future work" slide (D7, D8).
- **Status:** ✅ solved by decision.
