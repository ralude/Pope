namespace Pope.ShellHost;

// REQ-003-33: el efecto físico precede a cualquier confirmación lógica.
internal sealed class DesktopTransition(Action<bool> activate)
{
    internal bool Blocked { get; private set; } = true;
    internal bool Confirmed { get; private set; }
    internal void Apply(bool blocked)
    {
        if (Confirmed && Blocked == blocked) return;
        Confirmed = false;
        activate(blocked);
        Blocked = blocked; Confirmed = true;
    }
}
