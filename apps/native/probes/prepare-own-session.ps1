# REQ-003-40/43 · Fixture temporal del ensayo T10 aprobado; no es un instalador.
param(
    [Parameter(Mandatory = $true)][Guid] $RunId,
    [Parameter(Mandatory = $true)][Guid] $SnapshotId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$expectedVm = [Guid]'954b5530-1c41-4970-810f-c35d5aa48b05'
$computer = Get-CimInstance Win32_ComputerSystem
$hardware = Get-CimInstance Win32_ComputerSystemProduct
# Estas lecturas preceden a cualquier escritura o cambio de cuentas: proteger el host.
if ($computer.Model -ne 'VirtualBox' -or [Guid]$hardware.UUID -ne $expectedVm) {
    throw 'Preparación reservada exclusivamente a la VM 22h2 pope.'
}
if ($RunId -eq [Guid]::Empty -or $SnapshotId -eq [Guid]::Empty) {
    throw 'Falta identificador de ensayo o snapshot comprobado desde el host.'
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if ($identity.IsSystem -or !$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Abre la consola elevada bajo la administradora Windows existente.'
}

$clientName = 'PopeT10Client'
if (@(Get-LocalUser | Where-Object Name -eq $clientName).Count -ne 0) {
    throw 'La cuenta PopeT10Client ya existe; no se reutiliza ni modifica.'
}
$adminGroup = Get-LocalGroup -SID 'S-1-5-32-544'
$usersGroup = Get-LocalGroup -SID 'S-1-5-32-545'
$adminBefore = @(Get-LocalGroupMember -Group $adminGroup | ForEach-Object { $_.SID.Value } | Sort-Object)
$uacPath = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
$uacBefore = (Get-ItemProperty -LiteralPath $uacPath).EnableLUA
if ($uacBefore -ne 1) { throw 'La prueba necesita UAC activo; no se modifica su configuración.' }
$runRoot = Join-Path $env:ProgramData ('Pope-T10Session-' + $RunId.ToString('N'))
if (Test-Path -LiteralPath $runRoot) { throw 'La carpeta del ensayo ya existe; no se reemplaza.' }
New-Item -ItemType Directory -Path $runRoot | Out-Null

# Solo SYSTEM/Administradores escriben el manifiesto; Usuarios puede leer datos de ensayo.
$acl = [Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
foreach ($sid in @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-32-545')) {
    $rights = if ($sid -eq 'S-1-5-32-545') { 'ReadAndExecute' } else { 'FullControl' }
    $rule = [Security.AccessControl.FileSystemAccessRule]::new(
        [Security.Principal.SecurityIdentifier]::new($sid), $rights,
        'ContainerInherit, ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $runRoot -AclObject $acl
$manifestPath = Join-Path $runRoot 'manifest.json'
$marker = 'Pope T10 ' + $RunId.ToString('N')
$manifest = [ordered]@{
    RunId = $RunId.ToString('N'); SnapshotId = $SnapshotId.ToString()
    VmId = $expectedVm.ToString(); CreatedUtc = [DateTime]::UtcNow.ToString('o')
    ClientName = $clientName; ClientSid = $null; Marker = $marker
    AdminSid = $identity.User.Value; AdminGroupBefore = $adminBefore
    EnableLuaBefore = $uacBefore; Stage = 'Preparing'; StandardVerified = $false
}
function Save-Manifest {
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}
Save-Manifest
$password = $null
$created = $null
try {
    Write-Host 'Cuenta temporal PopeT10Client. Contraseña solo en esta consola privada de la VM.'
    $password = Read-Host 'Introduce una contraseña para el ensayo y recuérdala para iniciar Windows' -AsSecureString
    if ($password.Length -eq 0) { throw 'La cuenta de prueba exige contraseña.' }
    $created = New-LocalUser -Name $clientName -Password $password -Description $marker
    $manifest.ClientSid = $created.SID.Value
    $manifest.Stage = 'AccountCreated'
    Save-Manifest
    # El objeto LocalUser identifica la cuenta local exacta, sin resolver nombres de dominio.
    $usersCurrent = @(Get-LocalGroupMember -Group $usersGroup | ForEach-Object { $_.SID.Value })
    if ($usersCurrent -notcontains $created.SID.Value) {
        Add-LocalGroupMember -Group $usersGroup -Member $created
    }
    $adminAfter = @(Get-LocalGroupMember -Group $adminGroup | ForEach-Object { $_.SID.Value } | Sort-Object)
    $usersAfter = @(Get-LocalGroupMember -Group $usersGroup | ForEach-Object { $_.SID.Value })
    if ($adminAfter -contains $created.SID.Value -or $usersAfter -notcontains $created.SID.Value -or
        ($adminAfter -join '|') -ne ($adminBefore -join '|') -or
        (Get-ItemProperty -LiteralPath $uacPath).EnableLUA -ne $uacBefore) {
        throw 'No se verifican los grupos/UAC previstos.'
    }
    $manifest.StandardVerified = $true
    $manifest.Stage = 'Ready'
    Save-Manifest
    Write-Host 'Cuenta estándar creada y comprobada. No se ha cambiado de sesión Windows.'
    Write-Host ('Manifiesto sin contraseña: ' + $manifestPath)
}
catch {
    $manifest.Stage = 'Failed'
    # Si falla la preparación, deshabilitar solo la cuenta recién creada e identificada.
    if ($null -ne $created) {
        try {
            $current = Get-LocalUser -SID $created.SID
            if ($current.Description -eq $marker) { Disable-LocalUser -SID $created.SID }
        } catch { Write-Warning 'No se pudo deshabilitar la fixture; revisar su SID antes de retirar.' }
    }
    try { Save-Manifest } catch { Write-Warning 'No se pudo guardar el estado final del manifiesto.' }
    throw 'Preparación fallida. Revisar manifiesto y retirar solo recursos del ensayo.'
}
finally {
    if ($null -ne $password) { $password.Dispose() }
    $identity.Dispose()
}
