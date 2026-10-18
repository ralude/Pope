using System.ComponentModel;

namespace Pope.ShellHost;

// REQ-003-33: el efecto físico precede a cualquier confirmación lógica.
internal sealed class DesktopTransition(Action<bool> activate)
{
    internal bool Blocked { get; private set; } = true;
    internal bool Confirmed { get; private set; }
    internal int Failures { get; private set; }
    internal void Apply(bool blocked)
    {
        if (Confirmed && Blocked == blocked) return;
        Confirmed = false;
        activate(blocked);
        Blocked = blocked; Confirmed = true; Failures = 0;
    }
    // REQ-002-04/30: Windows rechaza SwitchDesktop mientras está activo el escritorio seguro
    // (Ctrl+Alt+Supr, UAC). El estado queda sin confirmar y el siguiente ciclo lo reintenta,
    // sin cerrar el host ni mostrar diálogos de excepción en el escritorio de uso.
    internal bool TryApply(bool blocked)
    {
        try { Apply(blocked); return true; }
        catch (Win32Exception) { Failures++; return false; }
    }
}
