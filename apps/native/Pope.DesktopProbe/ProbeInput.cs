using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Pope.DesktopProbe;

internal static class ProbeInput
{
    internal static void On(nint desktop, Action action)
    {
        Exception? error = null;
        var thread = new Thread(() =>
        {
            try
            {
                // Hilo auxiliar nuevo sin ventanas/hooks; nunca reasigna el hilo de WebView2.
                if (!SetThreadDesktop(desktop)) throw new Win32Exception();
                action();
            }
            catch (Exception exception) { error = exception; }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (error != null) throw new InvalidOperationException("Fallo del hilo de prueba", error);
    }

    internal static void Focus(nint window)
    {
        if (IsIconic(window)) ShowWindow(window, 9);
        if (!SetForegroundWindow(window) && GetForegroundWindow() != window)
        {
            // El bloqueo de foco de Windows exige entrada previa para activar una app.
            // Solo afecta al escritorio temporal activo, sin cerrar ni alterar ventanas.
            Send([Key(0x12), Key(0x12, 2)]);
            Thread.Sleep(100);
            if (!SetForegroundWindow(window) && GetForegroundWindow() != window)
                throw new Win32Exception($"No se pudo enfocar la ventana de prueba ({window}; foco={GetForegroundWindow()})");
        }
        Thread.Sleep(500);
    }

    internal static uint ForegroundPid()
    {
        GetWindowThreadProcessId(GetForegroundWindow(), out var pid);
        return pid;
    }

    internal static string Press()
    {
        var window = GetForegroundWindow();
        if (!GetClientRect(window, out var bounds)) throw new Win32Exception();
        var point = new CursorPoint { X = bounds.Right / 2, Y = bounds.Bottom / 2 };
        if (!ClientToScreen(window, ref point) || !SetCursorPos(point.X, point.Y)) throw new Win32Exception();
        Thread.Sleep(100);
        if (!GetCursorPos(out var actual)) throw new Win32Exception();
        var target = WindowFromPoint(actual);
        GetWindowThreadProcessId(target, out var targetPid);
        Send([Key(0x41), Key(0x41, 2),
            new() { Type = 0, Data = new() { Mouse = new() { Flags = 2 } } },
            new() { Type = 0, Data = new() { Mouse = new() { Flags = 4 } } }]);
        return $"window={window}; expected=({point.X},{point.Y}); cursor=({actual.X},{actual.Y}); target={target}; targetPid={targetPid}";
    }

    internal static void AltTab()
    {
        Send([Key(0x12), Key(0x09), Key(0x09, 2), Key(0x12, 2)]);
        Thread.Sleep(700);
    }

    internal static void Hold(ushort key, int milliseconds, bool click = false)
    {
        Send(click ? [Key(key), new() { Type = 0, Data = new() { Mouse = new() { Flags = 2 } } }] : [Key(key)]);
        try { Thread.Sleep(milliseconds); }
        finally { Send(click ? [Key(key, 2), new() { Type = 0, Data = new() { Mouse = new() { Flags = 4 } } }] : [Key(key, 2)]); }
    }

    // Oculta solo la ventana auxiliar ya verificada; deja juego/Pope en el selector.
    [DllImport("user32.dll")]
    internal static extern bool ShowWindow(nint window, int command);

    // SDL identifica teclas por scan code; un VK sin scan no prueba entrada del juego.
    private static Input Key(ushort key, uint flags = 0) => new() { Type = 1, Data = new() { Keyboard = new() { Scan = (ushort)MapVirtualKey(key, 0), Flags = flags | 8 } } };
    private static void Send(Input[] input)
    {
        if (SendInput((uint)input.Length, input, Marshal.SizeOf<Input>()) != input.Length) throw new Win32Exception("No se inyectó toda la entrada de prueba");
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Input { internal uint Type; internal InputData Data; }
    [StructLayout(LayoutKind.Explicit)]
    private struct InputData { [FieldOffset(0)] internal KeyboardInput Keyboard; [FieldOffset(0)] internal MouseInput Mouse; }
    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput { internal ushort Key, Scan; internal uint Flags, Time; internal nuint Extra; }
    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput { internal int X, Y; internal uint Data, Flags, Time; internal nuint Extra; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ClientRect { internal int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    private struct CursorPoint { internal int X, Y; }

    // Traduce las teclas internas del ensayo a códigos físicos para SendInput/SDL.
    [DllImport("user32.dll", EntryPoint = "MapVirtualKeyW")]
    private static extern uint MapVirtualKey(uint key, uint mapping);
    // Detecta minimización: enfocar una ventana exclusiva no basta para restaurarla.
    [DllImport("user32.dll")]
    private static extern bool IsIconic(nint window);

    // Mide el área cliente real; el centro del monitor no garantiza acertar en la app.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetClientRect(nint window, out ClientRect rectangle);
    // Convierte ese punto a coordenadas de pantalla antes de generar el clic.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ClientToScreen(nint window, ref CursorPoint point);
    // Sitúa el cursor dentro de la ventana enfocada del escritorio temporal activo.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetCursorPos(int x, int y);
    // Confirma el cursor efectivo para distinguir fallos del ratón virtual de aislamiento.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetCursorPos(out CursorPoint point);
    // Identifica la ventana real bajo el cursor antes de generar los botones del ratón.
    [DllImport("user32.dll")]
    private static extern nint WindowFromPoint(CursorPoint point);

    // Asigna el hilo de comprobación antes de usar APIs de ventanas del escritorio.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetThreadDesktop(nint desktop);
    // Enfoca únicamente la ventana creada por el prototipo para la prueba de entrada.
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(nint window);
    // Lee el foco real para verificar Alt+Tab en ambos sentidos sin Explorer.
    [DllImport("user32.dll")]
    private static extern nint GetForegroundWindow();
    // Atribuye ese foco al PID que fue lanzado, sin inferirlo por el título de la ventana.
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint window, out uint process);
    // Genera entrada controlada en el escritorio temporal; no envía mensajes a apps inactivas.
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, Input[] input, int size);
}
