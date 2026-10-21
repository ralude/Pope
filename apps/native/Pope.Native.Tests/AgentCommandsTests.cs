using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class AgentCommandsTests
{
    private const string Pc = "01900000-0000-7000-8000-000000000123";
    private const string Session = "01900000-0000-7000-8000-000000000124";
    private const string Revision = "01900000-0000-7000-8000-000000000130";
    private const string Order = "01900000-0000-7000-8000-000000000140";
    private const string Client = "S-1-5-21-1-2-3-1001";
    private const string Logon = "S-1-5-5-0-1";
    private const string Issued = "2026-10-21T20:00:00.000Z";
    private static readonly ClientHost Host = new(1, Client, Logon, 20, 600, @"C:\Pope\Pope.ShellHost.exe");

    private static JsonElement Message(object value) => ProtocolValidation.Parse(JsonSerializer.SerializeToUtf8Bytes(value), "node-to-pc");

    private static JsonElement Command(string kind = "lock", string revision = Revision, string id = Order) => Message(new
    {
        type = "command",
        command = new
        {
            id,
            pcId = Pc,
            actor = new { kind = "system" },
            expected = new { kind = "free", revision },
            issuedAt = Issued,
            expiresAt = "2026-10-21T20:00:30.000Z",
            action = new { kind }
        }
    }).GetProperty("command");

    private static JsonElement Staff(string kind) => Message(new
    {
        type = "command",
        command = new
        {
            id = Order,
            pcId = Pc,
            actor = new { kind = "staff", staffId = Pc, name = "Ana" },
            expected = new { kind = "free", revision = Revision },
            issuedAt = Issued,
            expiresAt = "2026-10-21T20:00:30.000Z",
            action = new { kind }
        }
    }).GetProperty("command");

    // PC con una sesión de cliente en curso, sus procesos y el agente cableado como en AgentRuntime.
    private sealed class Pc04
    {
        internal readonly Clock Time = new();
        internal readonly AgentState State;
        internal readonly ClientSessionCleanup Cleanup;
        internal readonly AgentCommands Commands;
        internal readonly List<ProcessEntry> Processes = [];
        internal readonly List<JsonElement> Sent = [];
        internal bool Stuck;
        internal long Now = 1_000;

        internal Pc04()
        {
            State = new AgentState(Pc, Time);
            Cleanup = new ClientSessionCleanup(() => Host, () => Processes.ToList(), entry =>
            {
                if (Stuck) return false;
                Processes.RemoveAll(p => p.Pid == entry.Pid); return true;
            }, _ => { })
            { Now = () => Now, Boot = () => 10, Interval = TimeSpan.FromMilliseconds(1), Passes = 2 };
            State.SessionStarted += Cleanup.Started;
            State.SessionFinished += id => _ = Cleanup.Finished(id);
            Commands = new AgentCommands(State, Cleanup, (bytes, _) =>
            {
                Sent.Add(ProtocolValidation.Parse(bytes, "pc-to-node")); return Task.FromResult(true);
            });
            Now = 1_100;
            State.Apply(Message(new
            {
                type = "state",
                status = "active",
                vesRate = (object?)null,
                session = new { kind = "temporary", sessionId = Session, startedAt = "2026-10-21T19:00:00Z", name = "Temporal", purchasedSeconds = 3600, remainingSeconds = 1800 }
            }));
            Now = 1_200; Processes.Add(new ProcessEntry(30, 0, Now, 1, Client, @"C:\Juegos\juego.exe", false));
            Now = 2_000;
        }

        internal void Free(string revision = Revision) =>
            State.Apply(Message(new { type = "controlState", serverTime = Issued, context = new { kind = "free", revision } }));

        internal void Ended() => State.Apply(Message(new { type = "sessionEnded", sessionId = Session, reason = "staff" }));

        internal IEnumerable<string?> Statuses() => Sent.Select(ack => ack.GetProperty("result").GetProperty("status").GetString());
    }

    private sealed class Clock : TimeProvider
    {
        internal long Ticks;
        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => Ticks;
        public override DateTimeOffset GetUtcNow() => DateTimeOffset.MinValue;
    }

    [Fact(DisplayName = "REQ-003-34/T29: un bloqueo vigente se acepta y se aplica tras cerrar los procesos del cliente")]
    public async Task LockAppliesAfterCleanup()
    {
        var pc = new Pc04();
        pc.Ended(); pc.Free();
        pc.Time.Ticks += 1_500;
        await pc.Commands.HandleAsync(Command(), CancellationToken.None);
        Assert.Equal(["accepted", "applied"], pc.Statuses());
        Assert.Empty(pc.Processes);
        Assert.All(pc.Sent, ack => Assert.Equal(Order, ack.GetProperty("commandId").GetString()));
        // Hora del nodo avanzada con el reloj monotónico, no la de Windows.
        Assert.Equal("2026-10-21T20:00:01.500Z", pc.Sent[0].GetProperty("occurredAt").GetString());
        Assert.True(pc.State.Blocked);

        // El reenvío tras reconectar no vuelve a ejecutar: repite la última respuesta.
        await pc.Commands.HandleAsync(Command(), CancellationToken.None);
        Assert.Equal(["accepted", "applied", "applied"], pc.Statuses());
    }

    [Fact(DisplayName = "REQ-003-34/T29: si quedan procesos del cliente, el bloqueo falla y la PC sigue reservada")]
    public async Task RemainingProcessesFailTheLock()
    {
        var pc = new Pc04 { Stuck = true };
        pc.Ended(); pc.Free();
        await pc.Commands.HandleAsync(Command(), CancellationToken.None);
        Assert.Equal(["accepted", "failed"], pc.Statuses());
        Assert.Equal("native_failure", pc.Sent[1].GetProperty("result").GetProperty("code").GetString());
        Assert.Single(pc.Processes);
    }

    [Fact(DisplayName = "REQ-003-34/T29: si el bloqueo llega antes del fin de sesión, termina la sesión local y limpia")]
    public async Task LockEndsALingeringSession()
    {
        var pc = new Pc04();
        pc.Free();
        Assert.Equal(Session, JsonSerializer.SerializeToElement(pc.State.Heartbeat()).GetProperty("sessionId").GetString());
        await pc.Commands.HandleAsync(Command(), CancellationToken.None);
        Assert.Equal(["accepted", "applied"], pc.Statuses());
        Assert.Empty(pc.Processes);
        Assert.True(pc.State.Blocked);
        Assert.Equal(JsonValueKind.Null, JsonSerializer.SerializeToElement(pc.State.Heartbeat()).GetProperty("sessionId").ValueKind);
    }

    [Fact(DisplayName = "REQ-003-20/T29: contexto distinto, sin contexto o vencida: falla sin ejecutar nada")]
    public async Task StaleOrExpiredDoesNothing()
    {
        var pc = new Pc04();
        await pc.Commands.HandleAsync(Command(), CancellationToken.None);
        pc.Free(Pc);
        await pc.Commands.HandleAsync(Command(id: Session), CancellationToken.None);
        pc.Free();
        pc.Time.Ticks += 30_000;
        await pc.Commands.HandleAsync(Command(id: Revision), CancellationToken.None);
        Assert.Equal(["failed", "failed", "failed"], pc.Statuses());
        Assert.Equal(["stale_context", "stale_context", "expired"],
            pc.Sent.Select(ack => ack.GetProperty("result").GetProperty("code").GetString()));
        Assert.Single(pc.Processes);
        Assert.False(pc.State.Blocked);
    }

    [Fact(DisplayName = "REQ-003-20/T29: reiniciar, apagar o mensajes aún no se ejecutan: invalid_action")]
    public async Task OtherKindsAreRefused()
    {
        var pc = new Pc04();
        pc.Free();
        await pc.Commands.HandleAsync(Staff("restart"), CancellationToken.None);
        Assert.Equal("invalid_action", pc.Sent.Single().GetProperty("result").GetProperty("code").GetString());
        Assert.Equal("restart", pc.Sent.Single().GetProperty("result").GetProperty("kind").GetString());
        Assert.False(pc.State.Blocked);
    }

    [Fact(DisplayName = "REQ-003-20/T29: el canal entrega las órdenes al agente fuera del bucle de recepción")]
    public async Task ChannelMessagesAreHandled()
    {
        var pc = new Pc04();
        pc.Ended(); pc.Free();
        pc.Commands.OnMessage(Message(new { type = "state", status = "locked" }));
        pc.Commands.OnMessage(Message(new { type = "command", command = JsonSerializer.Deserialize<object>(Command().GetRawText()) }));
        await pc.Commands.Idle();
        Assert.Equal(["accepted", "applied"], pc.Statuses());
    }
}
