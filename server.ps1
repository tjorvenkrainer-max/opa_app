# Kleiner lokaler Webserver fuer die Opa-Sprechhilfe.
# Braucht keine Installation: PowerShell ist auf jedem Windows vorhanden.
# Liefert nur Dateien aus diesem Ordner aus und ist nur von diesem Laptop
# aus erreichbar (localhost).
param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.wasm' = 'application/wasm'
    '.task' = 'application/octet-stream'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
    '.md'   = 'text/plain; charset=utf-8'
}

# Freien Port suchen (8080, 8081, ...), falls der erste belegt ist.
$listener = $null
for ($p = $Port; $p -lt ($Port + 10); $p++) {
    try {
        $l = New-Object System.Net.HttpListener
        $l.Prefixes.Add("http://localhost:$p/")
        $l.Start()
        $listener = $l
        $Port = $p
        break
    } catch {
        # Port belegt -> naechsten versuchen
    }
}
if (-not $listener) {
    Write-Host "Konnte keinen freien Port finden ($Port bis $($Port + 9))."
    exit 1
}

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  Opa-Sprechhilfe laeuft:  $url"
Write-Host "  Dieses Fenster offen lassen. Zum Beenden das Fenster schliessen."
Write-Host ""
if (-not $NoBrowser) { Start-Process $url }

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $res = $ctx.Response
        try {
            $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
            if ($rel -eq '') { $rel = 'index.html' }
            $file = [System.IO.Path]::GetFullPath((Join-Path $root $rel))

            # Nur Dateien innerhalb des App-Ordners ausliefern.
            $inside = $file.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar)

            # Ordner (z. B. /sprechtafel/): dessen index.html ausliefern.
            $isDir = $inside -and (Test-Path -LiteralPath $file -PathType Container)
            if ($isDir -and -not $ctx.Request.Url.AbsolutePath.EndsWith('/')) {
                # Ohne Schraegstrich am Ende: umleiten, sonst stimmen die Pfade in der Seite nicht.
                $res.StatusCode = 301
                $res.RedirectLocation = $ctx.Request.Url.AbsolutePath + '/'
                $bytes = [byte[]]@()
            } elseif ($isDir) {
                $file = Join-Path $file 'index.html'
            }

            if ($res.StatusCode -eq 301) {
                # Umleitung: nichts weiter zu tun
            } elseif (-not $inside -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
                $res.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('404 - nicht gefunden')
                $res.ContentType = 'text/plain; charset=utf-8'
            } else {
                $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
                $type = $mime[$ext]
                if (-not $type) { $type = 'application/octet-stream' }
                $res.ContentType = $type
                $bytes = [System.IO.File]::ReadAllBytes($file)
            }
            # Kein Zwischenspeichern, damit Aenderungen sofort sichtbar sind.
            $res.Headers['Cache-Control'] = 'no-cache'
            $res.ContentLength64 = $bytes.Length
            if ($ctx.Request.HttpMethod -ne 'HEAD') {
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } catch {
            try { $res.StatusCode = 500 } catch { }
        } finally {
            try { $res.Close() } catch { }
        }
    }
} finally {
    $listener.Stop()
}
