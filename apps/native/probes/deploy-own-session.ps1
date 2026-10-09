# REQ-003-40/43 · Publicación del observador fijo en la VM del ensayo autorizado.
param(
    [Parameter(Mandatory = $true)][Guid] $RunId,
    [Parameter(Mandatory = $true)][ValidatePattern('^[A-Fa-f0-9]{64}$')][string] $ArchiveHash
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ((Get-CimInstance Win32_ComputerSystem).Model -ne 'VirtualBox' -or
    [Guid](Get-CimInstance Win32_ComputerSystemProduct).UUID -ne [Guid]'954b5530-1c41-4970-810f-c35d5aa48b05') {
    throw 'Publicación reservada exclusivamente a la VM 22h2 pope.'
}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=[Security.Principal.WindowsPrincipal]::new($identity)
if ($identity.IsSystem -or !$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Se requiere la administradora elevada de la VM.'
}
$id=$RunId.ToString('N')
$runRoot=Join-Path $env:ProgramData ('Pope-T10Session-'+$id)
$manifestPath=Join-Path $runRoot 'manifest.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.RunId -ne $id -or $manifest.Stage -ne 'Ready' -or !$manifest.StandardVerified -or
    $manifest.AdminSid -ne $identity.User.Value) { throw 'La preparación no corresponde al ensayo/administradora.' }
$client=Get-LocalUser -SID $manifest.ClientSid
if ($client.Description -ne $manifest.Marker -or !$client.Enabled) { throw 'La fixture no coincide con el manifiesto.' }
$archive=Join-Path $PSScriptRoot 'observer.zip'
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $ArchiveHash) { throw 'Hash de publicación incorrecto.' }
$destination=Join-Path $runRoot 'probe'
if (Test-Path -LiteralPath $destination) { throw 'La publicación ya existe; no se reemplaza.' }
# El ZIP procede del publish comprobado. Verificar contención antes de extraerlo.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($archive)
try {
    $prefix=[IO.Path]::GetFullPath($destination)+[IO.Path]::DirectorySeparatorChar
    foreach ($entry in $zip.Entries) {
        $entryPath=[IO.Path]::GetFullPath((Join-Path $destination $entry.FullName))
        if (!$entryPath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta de ZIP fuera del ensayo.' }
    }
} finally { $zip.Dispose() }
Expand-Archive -LiteralPath $archive -DestinationPath $destination
$executable=Join-Path $destination 'Pope.DesktopProbe.exe'
if (!(Test-Path -LiteralPath $executable)) { throw 'Falta el observador publicado.' }
$desktop=[Environment]::GetFolderPath([Environment+SpecialFolder]::CommonDesktopDirectory)
$links=@()
$shell=New-Object -ComObject WScript.Shell
try {
    foreach ($role in @('client','admin')) {
        $label=if ($role -eq 'client') { 'Cliente' } else { 'Administrador' }
        $linkPath=Join-Path $desktop ('Pope T10 - '+$label+' - '+$id.Substring(0,8)+'.lnk')
        if (Test-Path -LiteralPath $linkPath) { throw 'El acceso directo ya existe; no se reemplaza.' }
        $link=$shell.CreateShortcut($linkPath)
        $link.TargetPath=$executable
        $link.Arguments='--session-window '+$id+' '+$role
        $link.WorkingDirectory=$destination
        $link.Description='Observación manual T10; conserva las ventanas al cambiar de usuario.'
        $link.Save()
        $links+=$linkPath
    }
} finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
[ordered]@{RunId=$id;ArchiveHash=$ArchiveHash;Shortcuts=$links;PreparedUtc=[DateTime]::UtcNow.ToString('o')} |
    ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $runRoot 'deployment.json') -Encoding UTF8
$identity.Dispose()
Write-Host 'Observador preparado. Usa el acceso Cliente al iniciar PopeT10Client.'
Write-Host 'No inicia ni cierra sesiones Windows y no configura autologin, shell o servicios.'
