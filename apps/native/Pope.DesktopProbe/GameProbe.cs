using System.Diagnostics;

namespace Pope.DesktopProbe;

// T09c · REQ-003-30/33, REQ-002-04/05: prueba portable, solo en VM aislada.
internal static class GameProbe
{
    internal static void Run(nint use, nint locked, string directory, string gameDirectory,
        List<Process> children, Dictionary<string, object?> report)
    {
        var config = Path.Combine(directory, "doom.cfg");
        var extra = Path.Combine(directory, "chocolate.cfg");
        var demo = Path.Combine(directory, "input");
        // default.cfg conserva los scan codes DOS, no los valores ASCII de WASD.
        File.WriteAllText(config, "mouse_sensitivity 0\nuse_mouse 1\nkey_up 17\nkey_down 31\nkey_left 30\nkey_right 32\n");
        File.WriteAllText(extra, "fullscreen 1\nfullscreen_width 800\nfullscreen_height 600\nforce_software_renderer 1\nstartup_delay 0\nshow_endoom 0\n");
        Size original = default;
        ProbeInput.On(use, () =>
        {
            original = DesktopNative.Resolution();
            ProbeInput.ShowWindow((nint)ProbeRun.Read(directory, "app").GetProperty("Window").GetInt64(), 0);
        });
        report["BeforeGameResolution"] = original;
        ProbeRun.Require(original != new Size(800, 600), "El modo inicial ya es 800x600; no demostraría cambio de resolución");
        var game = DesktopNative.StartExternal(DesktopNative.Name(use), Path.Combine(gameDirectory, "chocolate", "chocolate-doom.exe"),
            "-iwad", Path.Combine(gameDirectory, "data", "freedoom-0.13.0", "freedoom1.wad"),
            "-config", config, "-extraconfig", extra, "-warp", "1", "1", "-nomonsters", "-nosound", "-nogui", "-record", demo);
        children.Add(game);
        var watch = Stopwatch.StartNew();
        nint gameWindow = 0;
        ProbeInput.On(use, () =>
        {
            while (gameWindow == 0 && watch.Elapsed < TimeSpan.FromSeconds(15))
            {
                ProbeRun.Require(!game.HasExited, "El juego terminó antes de crear ventana");
                game.Refresh(); gameWindow = game.MainWindowHandle; Thread.Sleep(200);
            }
        });
        ProbeRun.Require(gameWindow != 0, "El juego no creó ventana en 15 s");
        Thread.Sleep(3000);
        ProbeInput.On(use, () =>
        {
            ProbeInput.Focus(gameWindow);
            report["GameResolution"] = DesktopNative.Resolution();
            ProbeRun.Require(DesktopNative.Resolution() == new Size(800, 600), "No se aplicó el modo exclusivo 800x600");
            ProbeInput.Hold(0x57, 500); // W: control positivo antes del bloqueo.
        });
        ProbeRun.Capture(use, directory, "game-before");
        ProbeInput.On(use, () =>
        {
            ProbeInput.AltTab();
            report["GameAltTabToPope"] = ProbeInput.ForegroundPid();
            ProbeRun.Require(ProbeInput.ForegroundPid() == children[0].Id, "No se pudo alcanzar Pope desde el juego");
            ProbeInput.AltTab();
            report["GameAltTabBack"] = ProbeInput.ForegroundPid();
            ProbeRun.Require(ProbeInput.ForegroundPid() == game.Id, "No se pudo volver al juego");
            ProbeInput.Hold(0x31, 200); // Selección 1: marca del comienzo en la demo.
        });
        Thread.Sleep(300);
        ProbeRun.Switch(locked);
        Thread.Sleep(700);
        var before = ProbeRun.Read(directory, "lock");
        var cpu = game.TotalProcessorTime;
        ProbeInput.On(locked, () =>
        {
            ProbeInput.Focus((nint)before.GetProperty("Window").GetInt64());
            ProbeInput.Press();
            ProbeInput.Hold(0x41, 2000, click: true); // A + disparo: no deben aparecer en la demo.
            ProbeInput.AltTab();
            ProbeRun.Require(ProbeInput.ForegroundPid() != game.Id, "Alt+Tab escapó al juego durante bloqueo");
        });
        Thread.Sleep(500);
        var receiver = ProbeRun.Read(directory, "lock");
        ProbeRun.Require(receiver.GetProperty("Keys").GetInt32() > before.GetProperty("Keys").GetInt32()
            && receiver.GetProperty("Clicks").GetInt32() > before.GetProperty("Clicks").GetInt32(), "No llegó entrada al bloqueo");
        report["GameAliveDuringLock"] = !game.HasExited;
        ProbeRun.Require(!game.HasExited, "El juego terminó durante el bloqueo");
        game.Refresh();
        report["GameCpuDuringLockMs"] = (game.TotalProcessorTime - cpu).TotalMilliseconds;
        ProbeRun.Capture(locked, directory, "game-lock");
        ProbeRun.Switch(use);
        ProbeInput.On(use, () =>
        {
            ProbeInput.Focus(gameWindow);
            report["GameResolutionAfter"] = DesktopNative.Resolution();
            ProbeRun.Require(DesktopNative.Resolution() == new Size(800, 600), "El juego no recuperó su modo gráfico");
            ProbeInput.Hold(0x32, 200); // Selección 2: marca del retorno en la demo.
            ProbeInput.Hold(0x53, 500, click: true); // S + disparo: controles positivos después.
        });
        report["GamePidPreserved"] = game.Id;
        ProbeRun.Capture(use, directory, "game-after");
        ProbeInput.On(use, () => ProbeInput.Hold(0x51, 200)); // Q termina y guarda la grabación.
        ProbeRun.Require(game.WaitForExit(5000), "El juego no guardó la demo al terminar");
        VerifyDemo(demo + ".lmp", report);
        report["GameDemoSaved"] = true;
        report["GamePassed"] = true;
    }

    private static void VerifyDemo(string path, Dictionary<string, object?> report)
    {
        // Formato Doom 1.9 oficial: cabecera de 13 bytes, 4 bytes por tic, final 0x80.
        // g_game.c / G_BeginRecording y G_WriteDemoTiccmd (Chocolate Doom 3.1.1).
        var bytes = File.ReadAllBytes(path);
        ProbeRun.Require(bytes.Length > 17 && bytes[0] == 109 && bytes[^1] == 0x80 && (bytes.Length - 14) % 4 == 0,
            "La demo no tiene el formato 1.9 esperado");
        var frames = new List<(sbyte Forward, sbyte Turn, byte Buttons)>();
        for (var i = 13; i < bytes.Length - 1; i += 4) frames.Add(((sbyte)bytes[i], (sbyte)bytes[i + 2], bytes[i + 3]));
        var start = frames.FindLastIndex(frame => (frame.Buttons & 0x1c) == 4);
        var end = frames.FindIndex(start + 1, frame => (frame.Buttons & 0x1c) == 12);
        ProbeRun.Require(start >= 0 && end > start + 35, "Faltan marcas o tics suficientes del intervalo bloqueado");
        var blocked = frames.Skip(start + 1).Take(end - start - 1).ToArray();
        report["GameBlockedTics"] = blocked.Length;
        report["GameBlockedMovementTics"] = blocked.Count(frame => frame.Forward != 0 || frame.Turn != 0);
        report["GameBlockedFireTics"] = blocked.Count(frame => (frame.Buttons & 1) != 0);
        ProbeRun.Require(blocked.All(frame => frame.Forward == 0 && frame.Turn == 0 && (frame.Buttons & 1) == 0),
            "El juego recibió movimiento o disparos durante el bloqueo");
        ProbeRun.Require(frames.Take(start).Any(frame => frame.Forward > 0), "Sin movimiento positivo antes del bloqueo");
        ProbeRun.Require(frames.Skip(end).Any(frame => frame.Forward < 0) && frames.Skip(end).Any(frame => (frame.Buttons & 1) != 0),
            "Sin movimiento/clic positivo al volver al juego");
        report["GameDemoTics"] = frames.Count;
    }
}
