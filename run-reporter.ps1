param(
    [string[]]$InputPaths,
    [switch]$ZipOnly = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Always operate from this script's directory
Set-Location -Path $PSScriptRoot

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
            # Convert to array regardless of return type
            $files = $dlg.FileNames
            if ($files -is [string]) {
                return @($files)
            } elseif ($files -is [array]) {
                return $files
            } else {
                # Handle edge case where FileNames might be null or other type
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
    
    # If we have mixed files or HTML files, use the new process-files.js
    if ($htmlFiles.Count -gt 0 -or $zipFiles.Count -gt 1) {
        Write-Host "Processing mixed/multiple files with process-files.js..." -ForegroundColor Cyan
        
        # Check if process-files.js exists, if not fall back to process-zip.js for single zip
        if (Test-Path -Path ".\process-files.js") {
            $allFiles = $zipFiles + $htmlFiles
            & node .\process-files.js @allFiles
        } else {
            if ($zipFiles.Count -eq 1 -and $htmlFiles.Count -eq 0) {
                Write-Host "Falling back to process-zip.js for single ZIP file..." -ForegroundColor Yellow
                & node .\process-zip.js $zipFiles[0]
            } else {
                throw "process-files.js not found. Cannot process multiple files or HTML files without it."
            }
        }
    } else {
        # Single ZIP file - use existing process-zip.js
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
    
    # Ensure InputPaths is always an array
    if ($InputPaths -is [string]) {
        $InputPaths = @($InputPaths)
    }
    
    # Check if we have any files
    if (-not $InputPaths -or $InputPaths.Count -eq 0) {
        Write-Warning 'No files provided. Exiting.'
        exit 1
    }
    
    # Validate all files exist
    foreach ($path in $InputPaths) {
        if (-not (Test-Path -LiteralPath $path)) {
            throw "File not found: $path"
        }
    }
    
    Write-Host "Processing $($InputPaths.Count) file(s):" -ForegroundColor Cyan
    foreach ($path in $InputPaths) {
        Write-Host "  - $path" -ForegroundColor Gray
    }
    
    # Process the files
    Process-InputFiles -files $InputPaths
    
    # Run summarization (this should work regardless of input method)
    Write-Host "Generating summary..." -ForegroundColor Cyan
    & node .\summarise.js
    
    # Verify output and open in default browser
    $summary = Join-Path -Path $PSScriptRoot -ChildPath 'summary.html'
    if (Test-Path -LiteralPath $summary) {
        Write-Host 'Opening summary.html...' -ForegroundColor Green
        Start-Process -FilePath $summary | Out-Null
        Write-Host 'Done.' -ForegroundColor Green
    } else {
        throw 'summary.html was not generated.'
    }
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}

# Usage examples:
# .\run-reporter.ps1                           # Browse for files (supports .zip and .html, multi-select)
# .\run-reporter.ps1 -ZipOnly                  # Browse for ZIP only (single select, backward compatible)
# .\run-reporter.ps1 -InputPaths "report.zip"  # Process specific ZIP file
# .\run-reporter.ps1 -InputPaths @("report1.html", "report2.html", "test.zip")  # Process multiple files