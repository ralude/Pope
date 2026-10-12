using System.Diagnostics;
using Pope.Bridge;

namespace Pope.DesktopProbe;

// Ensayo T18 sin UI/cuentas/servicios: un proceso distinto del mismo inicio de sesión.
internal static class PipePeer
{
    internal static int Run(string name, string serverPid, string mode)
    {
        var stage = "inicio";
        try
        {
            PipeEndpoints.ValidateName(name);
            if (mode == "hold") { Console.WriteLine("PipePeerReady"); Thread.Sleep(20_000); return 0; }
            if (mode != "denied" || !int.TryParse(serverPid, out var pid)) return 1;
            stage = "identidad";
            using var expected = new RetainedProcess(Process.GetProcessById(pid));
            using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            stage = "conexion";
            using var pipe = PipeEndpoints.Connect(name, expected, stop.Token).GetAwaiter().GetResult();
            stage = "lectura";
            try { PipeFrames.ReadAsync(pipe, "bridge-event", stop.Token).GetAwaiter().GetResult(); return 1; }
            catch (EndOfStreamException) { return 0; }
            catch (IOException) { return 0; }
        }
        catch (UnauthorizedAccessException) when (mode == "denied" && stage == "conexion") { return 0; }
        catch (Exception error) { Console.Error.WriteLine($"Ensayo de pipe fallido ({stage}/{error.GetType().Name})."); return 1; }
    }
}
