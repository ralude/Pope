using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;

namespace Pope.DesktopProbe;

// T31 · REQ-003-20: prueba real sin reiniciar ni apagar el equipo (mantenedor, 2026-10-21).
// La cadena de producto (AgentCommands + AgentPower + WindowsPower) pide a Windows el efecto
// con 60 s de margen y el ensayo lo anula enseguida; la anulación solo funciona si Windows
// lo había programado de verdad.
internal static class PowerProof
{
    private const uint GraceSeconds = 60;

    internal static int Run(string directory)
    {
        if (Directory.Exists(directory)) return 1;
        Directory.CreateDirectory(directory);
        var report = new Dictionary<string, object?> { ["Utc"] = DateTime.UtcNow, ["GraceSeconds"] = GraceSeconds };
        var passed = true;
        try
        {
            foreach (var kind in new[] { "restart", "powerOff" })
            {
                var state = new AgentState("01900000-0000-7000-8000-000000000123");
                var revision = Guid.CreateVersion7().ToString();
                var now = DateTime.UtcNow;
                static string Utc(DateTime value) => value.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);
                state.Apply(Node(new { type = "controlState", serverTime = Utc(now), context = new { kind = "free", revision } }));
                var acks = new List<JsonElement>(); var journal = new List<string>();
                int code = -1;
                var power = new AgentPower(k => code = WindowsPower.Initiate(k, GraceSeconds), [], entries => journal.Add(entries[^1].Status));
                var commands = new AgentCommands(state, new ClientSessionCleanup(() => null, () => [], _ => false, _ => { }),
                    (bytes, _) => { acks.Add(ProtocolValidation.Parse(bytes, "pc-to-node")); return Task.FromResult(true); }, power: power);
                var command = Node(new
                {
                    type = "command",
                    command = new
                    {
                        id = Guid.CreateVersion7().ToString(),
                        pcId = "01900000-0000-7000-8000-000000000123",
                        actor = new { kind = "staff", staffId = "01900000-0000-7000-8000-000000000124", name = "Ensayo" },
                        expected = new { kind = "free", revision },
                        issuedAt = Utc(now),
                        expiresAt = Utc(now.AddSeconds(30)),
                        action = new { kind }
                    }
                }).GetProperty("command");
                var watch = Stopwatch.StartNew();
                commands.HandleAsync(command, CancellationToken.None).GetAwaiter().GetResult();
                var requestedMs = watch.ElapsedMilliseconds;
                // Anular siempre que Windows lo aceptara, antes de comprobar nada más.
                var aborted = code == 0 && Abort();
                var abortError = code == 0 && !aborted ? Marshal.GetLastPInvokeError() : 0;
                report[kind] = new Dictionary<string, object?>
                {
                    ["WindowsCode"] = code,
                    ["RequestedMs"] = requestedMs,
                    ["Aborted"] = aborted,
                    ["AbortError"] = abortError,
                    ["JournalBeforeEffect"] = string.Join(",", journal),
                    ["Acks"] = acks.Select(a => a.GetProperty("result").GetProperty("status").GetString()).ToArray()
                };
                passed &= code == 0 && aborted && journal.SequenceEqual(["accepted"]) &&
                    acks.Select(a => a.GetProperty("result").GetProperty("status").GetString()).SequenceEqual(["accepted"]);
                if (code == 0 && !aborted) break; // No seguir si Windows quedó con un apagado pendiente.
            }
        }
        catch (Exception error)
        {
            passed = false; report["ErrorKind"] = error.GetType().Name; report["Error"] = error.Message;
        }
        report["Passed"] = passed;
        File.WriteAllText(Path.Combine(directory, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        return passed ? 0 : 1;
    }

    private static JsonElement Node(object value) => ProtocolValidation.Parse(JsonSerializer.SerializeToUtf8Bytes(value), "node-to-pc");

    private static bool Abort()
    {
        if (WindowsPower.EnableShutdownPrivilege() != 0) return false;
        // AbortSystemShutdownW: cancela el reinicio o apagado del equipo local que aún está en su
        // periodo de espera. Falla con ERROR_NO_SHUTDOWN_IN_PROGRESS si no había ninguno.
        return AbortSystemShutdownW(null);
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool AbortSystemShutdownW(string? machine);
}
