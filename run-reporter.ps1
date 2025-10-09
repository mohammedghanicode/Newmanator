param(
    [string]$ZipPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Always operate from this script's directory
Set-Location -Path $PSScriptRoot

function Show-ZipOpenDialog {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Filter = 'Zip files (*.zip)|*.zip|All files (*.*)|*.*'
    $dlg.Title = 'Select a Newman Reports ZIP'
    $dlg.InitialDirectory = [Environment]::GetFolderPath('Desktop')
    $dlg.Multiselect = $false
    $result = $dlg.ShowDialog()
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        return $dlg.FileName
    }
    return $null
}

try {
    if (-not $ZipPath) {
        Write-Host 'Browse to select a zip file...' -ForegroundColor Cyan
        $ZipPath = Show-ZipOpenDialog
        if (-not $ZipPath) {
            Write-Warning 'No file selected. Exiting.'
            exit 1
        }
    }

    if (-not (Test-Path -LiteralPath $ZipPath)) {
        throw "File not found: $ZipPath"
    }

    Write-Host "Processing: $ZipPath" -ForegroundColor Cyan

    # Run the existing pipeline (unzips into ./unzipped and generates summary.html)
    & node .\process-zip.js "$ZipPath"

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