# Educational Inequality Explorer - Troubleshooting Guide

## Error: "Unexpected end of JSON input"

This error occurs when the browser tries to load a JSON file that is incomplete, empty, or corrupted.

### Common Causes and Solutions

#### 1. **JSON File Not Generated**
**Problem:** The R script didn't complete successfully, so the JSON file was never created.

**Solution:**
- Open RStudio or R console
- Run the entire `prepare_pisa_data.R` script
- Wait for it to complete (it may take several minutes)
- Look for the success message: "✓ Data exported successfully to pisa_data.json"
- Check that the files exist in your working directory:
  - `pisa_data.json` (full dataset)
  - `pisa_data_sample.json` (smaller sample for testing)

#### 2. **Empty or Incomplete File**
**Problem:** The R script was interrupted before completing, creating an empty or partial JSON file.

**Solution:**
- Delete the existing JSON files
- Re-run `prepare_pisa_data.R` completely
- Don't interrupt the script while it's running
- Check the R console for any error messages

#### 3. **Wrong File Selected**
**Problem:** You're trying to load a file that isn't JSON (e.g., the R script itself).

**Solution:**
- Make sure you're selecting `pisa_data.json` or `pisa_data_sample.json`
- **NOT** the R script file (`prepare_pisa_data.R`)
- The file should be in the same folder where you ran the R script

#### 4. **File Size Too Large**
**Problem:** The full dataset might be too large for your browser to handle.

**Solution:**
- Try loading `pisa_data_sample.json` first (smaller test file)
- If the sample works, the issue is likely file size
- Consider:
  - Using fewer years in the R script (edit line 10)
  - Selecting specific countries only
  - Using a computer with more RAM

### Step-by-Step Verification

1. **Check if R script completed successfully:**
   ```r
   # In R console, check if files exist:
   file.exists("pisa_data.json")
   file.exists("pisa_data_sample.json")
   
   # Check file sizes:
   file.size("pisa_data.json") / 1024 / 1024  # Size in MB
   file.size("pisa_data_sample.json") / 1024 / 1024
   ```

2. **Verify JSON is valid:**
   ```r
   # In R console:
   library(jsonlite)
   test_data <- fromJSON("pisa_data_sample.json")
   head(test_data)
   ```

3. **Try the sample file first:**
   - Open the HTML file in your browser
   - Click "Load PISA Data File"
   - Select `pisa_data_sample.json` (not the full file)
   - If this works, the R script is working correctly

4. **Check browser console for detailed errors:**
   - Open your browser's developer tools (F12)
   - Go to the Console tab
   - Try loading the file again
   - Look for detailed error messages

### Updated HTML File

I've created an improved version: `educational_inequality_explorer_fixed.html`

**Improvements:**
- Better error messages that explain what went wrong
- Validates file size and content before parsing
- Checks for empty files
- Verifies JSON structure and required fields
- Provides specific troubleshooting suggestions
- Shows file size in the status message

### If Problems Persist

1. **Check R package installation:**
   ```r
   # Make sure all required packages are installed:
   install.packages(c("learningtower", "dplyr", "jsonlite"))
   library(learningtower)
   library(dplyr)
   library(jsonlite)
   ```

2. **Try a minimal test:**
   ```r
   # Create a tiny test file:
   test_data <- data.frame(
     country = "USA",
     year = 2018,
     achievement = 500,
     ses = 0.5
   )
   write(toJSON(test_data), "test.json")
   ```
   Then try loading `test.json` in the HTML application.

3. **Check your working directory:**
   ```r
   getwd()  # Shows current directory
   list.files(pattern = "\\.json$")  # Lists JSON files
   ```

### Contact Information

If you're still experiencing issues after trying these steps, please provide:
- The exact error message from the browser console (F12)
- The last few lines of output from running the R script
- Whether `pisa_data_sample.json` loads successfully
- Your R version and operating system

---

**Quick Fix:** Use the updated `educational_inequality_explorer_fixed.html` file, which provides much better error diagnostics and will help identify the specific problem.
