param(
    [string[]]$InputPaths,
    [switch]$ZipOnly = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- PATH LOGIC START ---
# BASE_DATA_PATH is provided by Electron in production. 
# If it doesn't exist (dev mode), we use the script root.
$BaseDir = if ($env:BASE_DATA_PATH) { $env:BASE_DATA_PATH } else { $PSScriptRoot }

# The .js files are always located in the script's root directory.
$ScriptDir = $PSScriptRoot 

# Change location to where the JS files are so 'node .\script.js' works
Set-Location -Path $ScriptDir
# --- PATH LOGIC END ---

function Show-ReportOpenDialog {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    
    if ($ZipOnly) {
        $dlg.Filter = 'Zip files (*.zip)|*.zip|All files (*.*)|*.*'
        $dlg.Title = 'Select a Newman Reports ZIP'
        $dlg.Multiselect = $false
    } else {
        $dlg.Filter = 'Newman Reports (*.zip;*.html)|*.zip;*.html|Zip files (*.zip)|*.zip|HTML files (*.html)|*.html|All files (*.*)|*.*'
        $dlg.Title = 'Select Newman Report(s)'
        $dlg.Multiselect = $true
    }
    
    $dlg.InitialDirectory = [Environment]::GetFolderPath('Desktop')
    $result = $dlg.ShowDialog()
    
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        if ($ZipOnly) {
            return @($dlg.FileName)
        } else {
            $files = $dlg.FileNames
            if ($files -is [string]) {
                return @($files)
            } elseif ($files -is [array]) {
                return $files
            } else {
                return @($dlg.FileName)
            }
        }
    }
    return $null
}

function Process-InputFiles {
    param([string[]]$files)
    
    $zipFiles = @()
    $htmlFiles = @()
    
    foreach ($file in $files) {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        switch ($ext) {
            '.zip' { $zipFiles += $file }
            '.html' { $htmlFiles += $file }
            default { 
                Write-Warning "Unsupported file type: $file (only .zip and .html are supported)"
            }
        }
    }
    
    if ($zipFiles.Count -eq 0 -and $htmlFiles.Count -eq 0) {
        throw "No valid .zip or .html files found in selection"
    }
    
    # Process mixed/multiple files
    if ($htmlFiles.Count -gt 0 -or $zipFiles.Count -gt 1) {
        Write-Host "Processing mixed/multiple files with process-files.js..." -ForegroundColor Cyan
        
        if (Test-Path -Path ".\process-files.js") {
            $allFiles = $zipFiles + $htmlFiles
            & node .\process-files.js @allFiles
        } else {
            if ($zipFiles.Count -eq 1 -and $htmlFiles.Count -eq 0) {
                Write-Host "Falling back to process-zip.js for single ZIP file..." -ForegroundColor Yellow
                & node .\process-zip.js $zipFiles[0]
            } else {
                throw "process-files.js not found."
            }
        }
    } else {
        # Single ZIP file
        Write-Host "Processing single ZIP with process-zip.js..." -ForegroundColor Cyan
        & node .\process-zip.js $zipFiles[0]
    }
}

try {
    # Handle input parameters
    if (-not $InputPaths) {
        Write-Host 'Browse to select report files...' -ForegroundColor Cyan
        $selected = Show-ReportOpenDialog
        if (-not $selected) {
            Write-Warning 'No files selected. Exiting.'
            exit 1
        }
        $InputPaths = $selected
    }
    
    if ($InputPaths -is [string]) { $InputPaths = @($InputPaths) }
    
    if (-not $InputPaths -or $InputPaths.Count -eq 0) {
        Write-Warning 'No files provided. Exiting.'
        exit 1
    }
    
    foreach ($path in $InputPaths) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "File not found: $path"
        }
    }
    
    Write-Host "Processing $($InputPaths.Count) file(s):" -ForegroundColor Cyan
    foreach ($path in $InputPaths) {
        Write-Host "  - $path" -ForegroundColor Gray
    }
    
    # 1. Process the files (Extracts to $BaseDir/unzipped)
    Process-InputFiles -files $InputPaths
    
    # 2. Run summarization
    Write-Host "Generating summary..." -ForegroundColor Cyan
    # Pass explicit paths to ensure it doesn't write to the read-only app directory
    & node .\summarise.js --input-dir "$BaseDir\unzipped" --output "$BaseDir\summary.html"
    
    # 3. Verify output in the writable BaseDir
    $summary = Join-Path -Path $BaseDir -ChildPath 'summary.html'
    
    if (Test-Path -LiteralPath $summary) {
        Write-Host "Opening summary: $summary" -ForegroundColor Green
        Start-Process -FilePath $summary | Out-Null
        Write-Host 'Done.' -ForegroundColor Green
    } else {
        throw "summary.html was not generated at $summary"
    }
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}