using System.Diagnostics;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class ClientSessionCleanupTests
{
    private const string Client = "S-1-5-21-1-2-3-1001";
    private const string Logon = "S-1-5-5-0-1";
    private const string S1 = "01900000-0000-7000-8000-000000000124";
    private const string S2 = "01900000-0000-7000-8000-000000000125";
    private static readonly ClientHost Host = new(1, Client, Logon, 20, 600, @"C:\Pope\Pope.ShellHost.exe");

    private sealed class Machine
    {
        internal long Now = 1_000;
        internal readonly List<ProcessEntry> Processes = [];
        internal readonly List<uint> Closed = [];
        internal ClientScope? Saved;
        internal ClientHost? Host = ClientSessionCleanupTests.Host;
        internal Func<ProcessEntry, bool>? OnClose;
        internal ClientSessionCleanup Cleanup() => new(() => Host, () => Processes.ToList(), entry =>
        {
            Closed.Add(entry.Pid); Processes.RemoveAll(p => p.Pid == entry.Pid);
            return OnClose?.Invoke(entry) ?? true;
        }, scope => Saved = scope)
        { Now = () => Now, Boot = () => 10, Interval = TimeSpan.FromMilliseconds(1) };
        internal void Start(uint pid, uint parent = 0, string image = @"C:\Juegos\juego.exe") =>
            Processes.Add(new ProcessEntry(pid, parent, Now, 1, Client, image, false));
    }

    [Fact(DisplayName = "REQ-003-34/CA-003-08: al terminar la sesión cierra sus procesos, también relanzados, y no los del siguiente")]
    public async Task ClosesSessionProcesses()
    {
        var machine = new Machine();
        machine.Start(10, image: @"C:\Windows\System32\sihost.exe");
        machine.Processes.Add(new ProcessEntry(20, 0, 600, 1, Client, Host.Image, false));
        var cleanup = machine.Cleanup();
        machine.Now = 1_100; cleanup.Started(S1);
        Assert.Equal(S1, machine.Saved!.SessionId); Assert.Equal(1_100, machine.Saved.Start);
        machine.Now = 1_200; machine.Start(30);
        // El lanzador relanza su ayudante en cuanto lo cierran: nace después del corte.
        machine.OnClose = entry => { if (entry.Pid == 30) { machine.Now = 3_000; machine.Start(31, 30); } return true; };
        machine.Now = 2_000;
        var finishing = cleanup.Finished(S1);
        Assert.Null(machine.Saved);
        machine.Now = 2_500; cleanup.Started(S2); machine.Start(50, 20);
        await finishing;
        Assert.Equal([30u, 31u], machine.Closed);
        Assert.Contains(machine.Processes, p => p.Pid == 50);
        Assert.Contains(machine.Processes, p => p.Pid == 10);
        Assert.Equal(S2, cleanup.Scope!.SessionId);
    }

    [Fact(DisplayName = "REQ-003-34: sin host, con otra sesión o con otro logon no se cierra nada")]
    public async Task UnknownScopeClosesNothing()
    {
        var machine = new Machine { Host = null };
        var cleanup = machine.Cleanup();
        cleanup.Started(S1); Assert.Null(machine.Saved);
        machine.Start(30); await cleanup.Finished(S1);
        machine.Host = Host; cleanup.Started(S1);
        await cleanup.Finished(S2); Assert.Equal(S1, cleanup.Scope!.SessionId);
        machine.Host = Host with { LogonSid = "S-1-5-5-0-2" };
        await cleanup.Finished(S1);
        Assert.Empty(machine.Closed);
    }

    [Fact(DisplayName = "REQ-003-34: un ámbito de otro arranque de Windows se descarta y nunca cierra procesos del logon nuevo")]
    public void OtherBootIsDiscarded()
    {
        var machine = new Machine(); var cleanup = machine.Cleanup();
        machine.Saved = new ClientScope(S1, 1, Client, Logon, 500, 10);
        cleanup.Restore(new ClientScope(S1, 1, Client, Logon, 900_000_000, 800_000_000));
        Assert.Null(cleanup.Scope); Assert.Null(machine.Saved);
        cleanup.Restore(new ClientScope(S1, 1, Client, Logon, 500, 10)); Assert.Equal(S1, cleanup.Scope!.SessionId);
        cleanup.Restore(new ClientScope(S1, 1, Client, Logon, 5, 10)); Assert.Null(cleanup.Scope);
    }

    [Fact(DisplayName = "REQ-003-34: el ámbito guardado es JSON estricto")]
    public void ScopeSerialization()
    {
        var scope = new ClientScope(S1, 1, Client, Logon, 1_100, 10);
        Assert.Equal(scope, ClientSessionCleanup.Parse(ClientSessionCleanup.Serialize(scope)));
        foreach (var bad in new[] { "{}", "{\"version\":1}", Json(sessionId: "pc"), Json(session: 0), Json(logonSid: Client), Json(extra: true) })
            Assert.Throws<InvalidDataException>(() => ClientSessionCleanup.Parse(System.Text.Encoding.UTF8.GetBytes(bad)));
    }
    private static string Json(string sessionId = S1, uint session = 1, string logonSid = Logon, bool extra = false)
    {
        var value = new Dictionary<string, object> { ["version"] = 1, ["sessionId"] = sessionId, ["session"] = session, ["userSid"] = Client, ["logonSid"] = logonSid, ["start"] = 1_100, ["boot"] = 10 };
        if (extra) value["pids"] = new[] { 4 };
        return JsonSerializer.Serialize(value);
    }

    [Fact(DisplayName = "REQ-003-34: el agente avisa inicio y fin solo con mensajes del nodo; pausa y revocación no terminan")]
    public void StateEvents()
    {
        var state = new AgentState("01900000-0000-7000-8000-000000000123");
        var events = new List<string>();
        state.SessionStarted += id => events.Add("+" + id[^3..]); state.SessionFinished += id => events.Add("-" + id[^3..]);
        state.Apply(Message(Active(S1))); state.Apply(Message(Active(S1, paused: true))); state.Apply(Message(Active(S1)));
        state.Apply(Message(Active(S2)));
        state.Apply(Message(new { type = "sessionEnded", sessionId = S2, reason = "exhausted" }));
        state.Apply(Message(Active(S1))); state.Apply(Message(new { type = "state", status = "locked" }));
        state.Apply(Message(Active(S2)));
        state.Apply(Message(new { type = "pcAuthenticationError", code = "pc_credential_revoked", message = "Credencial revocada" }));
        Assert.Equal(["+124", "-124", "+125", "-125", "+124", "-124", "+125"], events);
    }
    private static JsonElement Message(object value) => ProtocolValidation.Parse(JsonSerializer.SerializeToUtf8Bytes(value), "node-to-pc");
    private static object Active(string session, bool paused = false) => new
    {
        type = "state",
        status = "active",
        vesRate = (object?)null,
        session = new
        {
            kind = "account",
            sessionId = session,
            startedAt = "2026-10-19T00:00:00Z",
            username = "Cliente",
            ratePerHour = new { micros = 1000000, currency = "USD" },
            money = new { micros = 1000000, currency = "USD" },
            moneySeconds = 100,
            comboSeconds = 0,
            remainingSeconds = 100,
            pause = paused ? new { startedAt = "2026-10-19T00:00:00Z", maxUntil = "2026-10-19T00:15:00Z", secondsLeft = 900, billing = false } : null
        }
    };

    [Fact(DisplayName = "REQ-003-34: Win32 describe y cierra solo el proceso con la misma hora de creación")]
    public void RealProcessIdentity()
    {
        var me = ClientProcesses.Describe((uint)Environment.ProcessId)!.Value;
        Assert.Equal((uint)Process.GetCurrentProcess().SessionId, me.Session);
        Assert.Equal(System.Security.Principal.WindowsIdentity.GetCurrent().User!.Value, me.UserSid);
        Assert.Equal(Environment.ProcessPath, me.Image, ignoreCase: true);
        Assert.Contains(ClientProcesses.Snapshot(), p => p.Pid == me.Pid && p.Created == me.Created);
        using var child = Process.Start(new ProcessStartInfo("ping.exe", "-n 30 127.0.0.1") { UseShellExecute = false, CreateNoWindow = true })!;
        try
        {
            var entry = ClientProcesses.Describe((uint)child.Id)!.Value;
            Assert.True(ClientProcesses.Close(entry with { Created = entry.Created + 1 }));
            Assert.False(child.HasExited);
            Assert.True(ClientProcesses.Close(entry)); Assert.True(child.WaitForExit(2000));
            Assert.True(ClientProcesses.Close(entry));
            // El objeto Process aún retiene el proceso terminado: no debe parecer vivo.
            Assert.Null(ClientProcesses.Describe((uint)child.Id));
        }
        finally { if (!child.HasExited) child.Kill(true); }
    }
}
