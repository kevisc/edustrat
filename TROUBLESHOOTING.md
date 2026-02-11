# Troubleshooting Guide - Deployed App Issues

## Issue: App loads data but shows no visualizations or exports

### Symptoms:
- Data loads successfully (console shows "✓ Loaded X student records")
- All tabs are empty (no graphs, no statistics)
- Export buttons don't respond
- Console shows "✓ Initial analyses complete (placeholder)"

### Root Cause:
**Browser cache** is serving old JavaScript files from Phase 2 (before analysis/visualization/export modules were added).

### Solution 1: Hard Refresh Browser (RECOMMENDED - Try This First!)

**Windows/Linux:**
- Press `Ctrl + Shift + R`
- Or `Ctrl + F5`

**macOS:**
- Press `Cmd + Shift + R`
- Or `Cmd + Option + R`

This forces the browser to reload all files from the server, bypassing cache.

### Solution 2: Clear Browser Cache

**Chrome:**
1. Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
2. Select "Cached images and files"
3. Choose "All time"
4. Click "Clear data"
5. Reload the page with `Ctrl + R`

**Firefox:**
1. Press `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
2. Select "Cache"
3. Click "Clear Now"
4. Reload the page with `Ctrl + R`

**Safari:**
1. Go to Preferences > Advanced
2. Check "Show Develop menu"
3. In Develop menu, select "Empty Caches"
4. Reload the page with `Cmd + R`

### Solution 3: Private/Incognito Window

Open the app in a private/incognito window which doesn't use cache:
- Chrome: `Ctrl + Shift + N` (Windows) or `Cmd + Shift + N` (Mac)
- Firefox: `Ctrl + Shift + P` (Windows) or `Cmd + Shift + P` (Mac)
- Safari: `Cmd + Shift + N`

### Verify the Fix Worked:

After clearing cache or hard refresh, check the browser console:

**OLD VERSION (cached) shows:**
```
app.js:288 Sample record fields: Array(21)
app.js:297 ✓ Initial analyses complete (placeholder)
```

**NEW VERSION (correct) should show:**
```
app.js:393 ✓ Descriptive statistics calculated
app.js:394   - Mean: 423.45
app.js:395   - Gini: 0.089
app.js:396   - Gradient: 38.72
app.js:401 ✓ Overview tab updated
app.js:416 ✓ Initial analyses complete
```

### What Changed:

**Version 3.0.0 (Latest):**
- Added analysis modules (descriptive, regression, decomposition, diagnostics)
- Added visualization modules (overview, distribution, regression, comparative)
- Added export modules (CSV, PNG/SVG, HTML reports, data exports)
- Added academic documentation (methodology, citations, data sources)

The cache-busting parameter (`?v=3.0.0`) has been added to force browsers to load the new version.

## Issue: Still Not Working After Cache Clear

### Check for JavaScript Errors:

1. Open browser console (F12)
2. Look for red error messages
3. Common issues:

**Module loading errors:**
```
Failed to load module script: Expected a JavaScript module script...
```
Solution: Make sure all .js files are committed and pushed to GitHub

**Import errors:**
```
Uncaught SyntaxError: Cannot use import statement outside a module
```
Solution: Verify `type="module"` is in the script tag

**Missing function errors:**
```
Uncaught ReferenceError: calculateDescriptiveStats is not defined
```
Solution: Check that all analysis/visualization modules are deployed

### Verify Deployment:

Check that GitHub Pages has the latest files:
1. Go to your repository on GitHub
2. Click on "Environments" in the right sidebar
3. Click on "github-pages"
4. Verify deployment timestamp is recent (within last few minutes)

If deployment is old:
1. Go to repository Settings → Pages
2. Verify source is set to "main" branch, "/" (root) folder
3. Click "Save" to trigger new deployment
4. Wait 1-2 minutes for deployment to complete

### Check Network Tab:

1. Open browser DevTools (F12)
2. Go to Network tab
3. Reload page (`Ctrl + R`)
4. Look for:
   - `app.js` - should return status 200
   - `app.js?v=3.0.0` - verify the version parameter
   - All module files in `js/analysis/`, `js/visualization/`, `js/export/`

If any files show 404:
- Files not pushed to GitHub → commit and push
- GitHub Pages not deployed → check deployment status

## Issue: Export Buttons Don't Work

### Symptoms:
- Clicking export buttons does nothing
- No download dialog appears
- No errors in console

### Possible Causes:

**1. Old JavaScript cached (see above solutions)**

**2. No data loaded:**
- Must load data first before exporting
- Check that data is loaded: console should show "✓ Loaded X student records"

**3. Browser popup blocker:**
- Browser may be blocking download popups
- Look for blocked popup icon in address bar
- Allow popups from your site

**4. Module import errors:**
- Check browser console for errors
- Verify export modules are loaded

### Test Export Functions:

Open browser console and test manually:
```javascript
// Test if export modules are loaded
import('./js/export/csv-export.js').then(m => console.log('CSV export loaded:', m));
import('./js/export/figure-export.js').then(m => console.log('Figure export loaded:', m));
```

## Issue: Want to Add More PISA Years (2000-2009)

### Current Status:
- App currently includes years: 2012, 2015, 2018, 2022 (4 cycles)
- learningtower package supports: 2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022 (8 cycles)

### To Add All Years:

**Step 1: Update R Script**
The file `pisa/pipeline/scripts/01-generate-chunks.R` has been updated to include all years:
```r
YEARS <- c(2000, 2003, 2006, 2009, 2012, 2015, 2018, 2022)
```

**Step 2: Re-run Data Generation**
```r
# In RStudio
setwd("C:/Users/Kevin/Documents/GitHub/kevisc.github.io/pisa/pipeline/scripts")
source("01-generate-chunks.R")   # ~30-45 minutes (more years = more time)
source("02-create-metadata.R")   # ~2-3 minutes
source("03-validate-chunks.R")   # ~2-3 minutes
```

**Step 3: Commit and Push New Data**
```bash
cd C:\Users\Kevin\Documents\GitHub\kevisc.github.io
git add pisa/data/
git commit -m "data: add PISA years 2000-2009 (8 cycles total)"
git push origin main
```

**Expected Results:**
- Additional ~400-500 JSON files (total ~800 files for 8 years vs ~320 for 4 years)
- Total data size: ~2-2.5 GB (increased from ~1 GB)
- More countries available (early years had fewer participants)

**Note:** GitHub has a 1 GB repo size recommendation. With 2.5 GB, you may get warnings but it should still work. If issues arise, consider:
- GitHub Releases for data hosting
- AWS S3 free tier
- Cloudflare R2

## Issue: App is Slow or Crashes

### Symptoms:
- Browser freezes when loading many countries
- Tab switching is very slow
- Memory warnings

### Causes:
- Loading too much data at once (50+ chunks, >200 MB)
- Browser memory limitations

### Solutions:

**1. Load Fewer Countries/Years:**
- Start with 2-3 countries and 1-2 years
- Load additional data as needed

**2. Close Other Tabs:**
- Each browser tab uses memory
- Close unused tabs before loading large datasets

**3. Use Smaller Selections for Visualization:**
- Load full data for statistics (which can handle large N)
- Consider downsampling for visualizations if > 100,000 students

**4. Refresh Page Between Large Loads:**
- Clears memory
- Removes cached chunks
- Fresh start

### Memory Usage Guide:
- Small selection (2 countries, 2 years): ~20-30 MB
- Medium selection (5 countries, 3 years): ~50-80 MB
- Large selection (10 countries, 4 years): ~150-200 MB
- Very large (20+ countries, 6+ years): >300 MB (may cause issues)

## Getting Help

If issues persist after trying these solutions:

1. **Check Console:** Press F12, look for errors
2. **Check Network:** DevTools → Network tab → reload page → look for 404s or failed requests
3. **Check Deployment:** GitHub repo → Environments → verify recent deployment
4. **Try Different Browser:** Test in Chrome, Firefox, Safari to isolate browser-specific issues
5. **Check This File:** Make sure you're looking at the LATEST version after cache clear

## Quick Fix Commands

```bash
# Commit cache-busting fix
cd C:\Users\Kevin\Documents\GitHub\kevisc.github.io
git pull origin main  # Get latest changes
git add pisa/
git commit -m "fix: force cache reload"
git push origin main

# Wait 1-2 minutes for GitHub Pages deployment
# Then hard refresh browser: Ctrl+Shift+R
```

---

**Last Updated:** 2025-12-16
**App Version:** 3.0.0 (Phases 1-5 complete)
