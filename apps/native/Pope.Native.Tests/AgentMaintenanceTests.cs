using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class AgentMaintenanceTests
{
    private const string Pc = "01900000-0000-7000-8000-000000000123";
    private const string Maintenance = "01900000-0000-7000-8000-0000000000aa";
    private const string Revision = "01900000-0000-7000-8000-000000000130";
    private const string Order = "01900000-0000-7000-8000-000000000140";
    private const string ExitFromPanel = "01900000-0000-7000-8000-000000000150";
    private const string Issued = "2026-10-22T20:00:00.000Z";

    private static JsonElement Message(object value) => ProtocolValidation.Parse(JsonSerializer.SerializeToUtf8Bytes(value), "node-to-pc");

    private sealed class Clock : TimeProvider
    {
        internal long Ticks;
        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => Ticks;
    }

    // Agente de mantenimiento con el nodo, el disco y Windows simulados.
    private sealed class Rig
    {
        internal readonly List<string> Calls = [];
        internal readonly List<JsonElement> Sent = [];
        internal readonly Clock Time = new();
        internal IReadOnlyList<ExitEntry> Journal;
        internal bool Online = true, StoreFails, CloseOk = true, LockOk = true;
        internal DateTimeOffset? Node;
        internal readonly AgentMaintenance Agent;

        internal Rig(IReadOnlyList<ExitEntry>? saved = null)
        {
            Journal = saved ?? [];
            Agent = new AgentMaintenance(Journal, entries =>
            {
                if (StoreFails) throw new IOException("Disco lleno");
                Calls.Add("store"); Journal = entries;
            }, (bytes, _) =>
            {
                Calls.Add("send");
                if (!Online) return Task.FromResult(false);
                // Cada mensaje cumple el contrato del nodo.
                Sent.Add(ProtocolValidation.Parse(bytes, "pc-to-node")); return Task.FromResult(true);
            }, _ => { Calls.Add("close"); return Task.FromResult(CloseOk); },
            _ => { Calls.Add("lock"); return Task.FromResult(LockOk); }, () => Node, Time);
        }

        internal void Open(string id = Maintenance, string startedAt = Issued) => Agent.OnMessage(Message(new
        {
            type = "maintenanceState",
            maintenance = new
            {
                id,
                pc = new { id = Pc, name = "PC 04" },
                actor = new { kind = "staff", staffId = Pc, name = "Ana" },
                source = "local",
                startedAt
            }
        }));

        internal void Acknowledge(string exitId) => Agent.OnMessage(Message(new { type = "maintenanceExitAcknowledged", exitId, maintenanceId = Maintenance }));
    }

    private static ExitEntry Entry(int n) => new($"01900000-0000-7000-8000-{n:D12}", Maintenance, Issued, 60);

    [Fact(DisplayName = "CA-003-09/T40: terminar sin red cierra, bloquea y guarda la salida antes de intentar enviarla")]
    public async Task EndsWithoutNetwork()
    {
        var rig = new Rig { Online = false };
        rig.Open();
        Assert.True(await rig.Agent.EndForShellAsync(Maintenance, CancellationToken.None));
        Assert.Equal(["close", "lock", "store", "send"], rig.Calls);
        Assert.Empty(rig.Sent);
        var saved = Assert.Single(rig.Journal);
        Assert.Equal(Maintenance, saved.MaintenanceId);
        Assert.Null(rig.Agent.Current);
        Assert.Equal(saved.ExitId, rig.Agent.FirstPending());
    }

    [Fact(DisplayName = "REQ-003-44/T40: al reconectar se envía la salida y su reconocimiento la borra del diario")]
    public async Task ResendsUntilAcknowledged()
    {
        var rig = new Rig { Online = false };
        rig.Open();
        await rig.Agent.EndForShellAsync(Maintenance, CancellationToken.None);
        var pending = rig.Journal.Single();

        rig.Online = true;
        await rig.Agent.ResendPendingAsync(CancellationToken.None);
        var message = Assert.Single(rig.Sent).GetProperty("exit");
        Assert.Equal(pending.ExitId, message.GetProperty("id").GetString());
        Assert.Equal(Maintenance, message.GetProperty("maintenanceId").GetString());
        // El ACK se perdió: tras otra reconexión se reenvía la misma salida.
        await rig.Agent.ResendPendingAsync(CancellationToken.None);
        Assert.Equal(2, rig.Sent.Count);
        Assert.Equal(pending.ExitId, rig.Sent[1].GetProperty("exit").GetProperty("id").GetString());

        rig.Acknowledge(pending.ExitId);
        Assert.Empty(rig.Journal);
        Assert.Null(rig.Agent.FirstPending());
        // Un reconocimiento duplicado no toca el diario.
        var stores = rig.Calls.Count(call => call == "store");
        rig.Acknowledge(pending.ExitId);
        Assert.Equal(stores, rig.Calls.Count(call => call == "store"));
    }

    [Fact(DisplayName = "REQ-003-44/T40: tras reiniciar el agente la salida guardada sigue pendiente y se reenvía")]
    public async Task SurvivesRestart()
    {
        var rig = new Rig([Entry(1), Entry(2)]);
        Assert.Equal(Entry(1).ExitId, rig.Agent.FirstPending());
        await rig.Agent.ResendPendingAsync(CancellationToken.None);
        Assert.Equal([Entry(1).ExitId, Entry(2).ExitId], rig.Sent.Select(m => m.GetProperty("exit").GetProperty("id").GetString()));
    }

    [Fact(DisplayName = "REQ-003-44/T40: la desconexión no termina el mantenimiento ni toca nada")]
    public void ConnectionLossDoesNotEndMaintenance()
    {
        var rig = new Rig { Online = false };
        rig.Open();
        Assert.Equal(Maintenance, rig.Agent.Current);
        Assert.Empty(rig.Calls);
        // Un estado repetido tras reconectar tampoco lo cambia; solo el nodo lo da por cerrado.
        rig.Open();
        Assert.Equal(Maintenance, rig.Agent.Current);
        rig.Agent.OnMessage(Message(new { type = "maintenanceState", maintenance = (object?)null }));
        Assert.Null(rig.Agent.Current);
    }

    [Fact(DisplayName = "REQ-003-44/T40: con el diario lleno no se pierde ninguna salida pendiente")]
    public async Task FullJournalKeepsEveryPending()
    {
        var rig = new Rig(Enumerable.Range(1, MaintenanceExitJournal.Capacity).Select(Entry).ToList());
        rig.Open();
        Assert.False(await rig.Agent.EndForShellAsync(Maintenance, CancellationToken.None));
        Assert.Equal(MaintenanceExitJournal.Capacity, rig.Journal.Count);
        Assert.Equal(Maintenance, rig.Agent.Current);
        Assert.DoesNotContain("send", rig.Calls);
        // Al reconocer una vuelve a caber y el mantenimiento puede terminar.
        rig.Acknowledge(Entry(1).ExitId);
        Assert.True(await rig.Agent.EndForShellAsync(Maintenance, CancellationToken.None));
        Assert.Equal(MaintenanceExitJournal.Capacity, rig.Journal.Count);
    }

    [Fact(DisplayName = "REQ-003-43/T40: un fallo al cerrar, bloquear o guardar no da por terminado el mantenimiento")]
    public async Task FailuresKeepMaintenance()
    {
        var closing = new Rig { CloseOk = false };
        closing.Open();
        Assert.False(await closing.Agent.EndForShellAsync(Maintenance, CancellationToken.None));
        Assert.Equal(["close"], closing.Calls);

        var locking = new Rig { LockOk = false };
        locking.Open();
        Assert.False(await locking.Agent.EndForShellAsync(Maintenance, CancellationToken.None));
        Assert.Equal(["close", "lock"], locking.Calls);
        Assert.Empty(locking.Journal);
        Assert.Equal(Maintenance, locking.Agent.Current);

        var storing = new Rig { StoreFails = true };
        storing.Open();
        Assert.False(await storing.Agent.EndForShellAsync(Maintenance, CancellationToken.None));
        Assert.DoesNotContain("send", storing.Calls);
        Assert.Equal(Maintenance, storing.Agent.Current);

        // Otro mantenimiento, o ninguno, no se puede terminar desde aquí.
        var other = new Rig();
        other.Open();
        Assert.False(await other.Agent.EndForShellAsync("01900000-0000-7000-8000-0000000000bb", CancellationToken.None));
        Assert.False(await new Rig().Agent.EndForShellAsync(Maintenance, CancellationToken.None));
        Assert.Empty(other.Calls);
    }

    [Fact(DisplayName = "REQ-003-41/T40: la duración sale de la hora del nodo o, si no, del reloj monotónico")]
    public async Task DurationUsesNodeThenMonotonicClock()
    {
        var byNode = new Rig { Node = DateTimeOffset.Parse("2026-10-22T20:02:00Z") };
        byNode.Open(startedAt: "2026-10-22T20:00:00.000Z");
        await byNode.Agent.EndForShellAsync(Maintenance, CancellationToken.None);
        Assert.Equal(120, byNode.Journal.Single().DurationSeconds);
        Assert.Equal("2026-10-22T20:02:00.000Z", byNode.Journal.Single().EndedAt);

        var byClock = new Rig();
        byClock.Open();
        byClock.Time.Ticks += 45_000;
        await byClock.Agent.EndForShellAsync(Maintenance, CancellationToken.None);
        Assert.Equal(45, byClock.Journal.Single().DurationSeconds);
    }

    private static JsonElement EndOrder() => Message(new
    {
        type = "command",
        command = new
        {
            id = Order,
            pcId = Pc,
            actor = new { kind = "staff", staffId = Pc, name = "Beto" },
            expected = new { kind = "maintenance", revision = Revision, maintenanceId = Maintenance },
            issuedAt = Issued,
            expiresAt = "2026-10-22T20:00:30.000Z",
            action = new { kind = "endMaintenance", maintenanceId = Maintenance, exitId = ExitFromPanel }
        }
    }).GetProperty("command");

    [Fact(DisplayName = "REQ-003-43/T40: la orden del panel acusa applied con la salida y el exitId de la orden")]
    public async Task PanelOrderAnswersWithTheExit()
    {
        var rig = new Rig();
        rig.Open();
        var state = new AgentState(Pc);
        state.Apply(Message(new
        {
            type = "controlState",
            serverTime = Issued,
            context = new { kind = "maintenance", revision = Revision, maintenanceId = Maintenance }
        }));
        var sent = new List<JsonElement>();
        var commands = new AgentCommands(state, new ClientSessionCleanup(() => null, () => [], _ => true, _ => { }),
            (bytes, _) => { sent.Add(ProtocolValidation.Parse(bytes, "pc-to-node")); return Task.FromResult(true); }, maintenance: rig.Agent);

        await commands.HandleAsync(EndOrder(), CancellationToken.None);
        Assert.Equal(["accepted", "applied"], sent.Select(m => m.GetProperty("result").GetProperty("status").GetString()));
        var exit = sent[1].GetProperty("result").GetProperty("effect").GetProperty("exit");
        Assert.Equal(ExitFromPanel, exit.GetProperty("id").GetString());
        Assert.Equal(Maintenance, exit.GetProperty("maintenanceId").GetString());
        Assert.Equal(["close", "lock", "store"], rig.Calls);
        Assert.Equal(ExitFromPanel, rig.Journal.Single().ExitId);

        // La misma orden otra vez (reenvío al reconectar) repite el resultado sin cerrar de nuevo.
        await commands.HandleAsync(EndOrder(), CancellationToken.None);
        Assert.Equal(3, sent.Count);
        Assert.Equal(["close", "lock", "store"], rig.Calls);
    }

    [Fact(DisplayName = "REQ-003-43/T40: tras reiniciar el agente, la orden repetida devuelve la salida ya guardada")]
    public async Task RepeatedOrderAfterRestartReturnsSavedExit()
    {
        var saved = new ExitEntry(ExitFromPanel, Maintenance, Issued, 30);
        var rig = new Rig([saved]);
        var (exit, failure) = await rig.Agent.FinishAsync(ExitFromPanel, Maintenance, CancellationToken.None);
        Assert.Equal(saved, exit);
        Assert.Null(failure);
        Assert.Empty(rig.Calls);
    }
}
