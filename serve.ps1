$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()
Write-Host "Server running on http://localhost:8080/"

$baseDir = "C:\Users\user\.gemini\antigravity-ide\scratch\minimal-live-tracker"

try {
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $req = $context.Request
            $res = $context.Response
            
            $path = $req.Url.LocalPath.TrimStart('/')
            if ([string]::IsNullOrEmpty($path)) { $path = "index.html" }
            
            $filePath = Join-Path $baseDir $path
            
            if (Test-Path $filePath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                if ($filePath.EndsWith(".html")) { $res.ContentType = "text/html; charset=utf-8" }
                elseif ($filePath.EndsWith(".css")) { $res.ContentType = "text/css; charset=utf-8" }
                elseif ($filePath.EndsWith(".js")) { $res.ContentType = "application/javascript; charset=utf-8" }
                elseif ($filePath.EndsWith(".json")) { $res.ContentType = "application/json; charset=utf-8" }
                elseif ($filePath.EndsWith(".png")) { $res.ContentType = "image/png" }
                elseif ($filePath.EndsWith(".svg")) { $res.ContentType = "image/svg+xml" }
                
                $res.ContentLength64 = $bytes.Length
                if ($req.HttpMethod -ne "HEAD") {
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } else {
                $res.StatusCode = 404
            }
            $res.OutputStream.Close()
        } catch {
            Write-Warning $_
        }
    }
} finally {
    $listener.Stop()
}
