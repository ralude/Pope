using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class AgentHostBridgeTests
{
    [Fact(DisplayName = "REQ-003-63/T27: sin noticias del nodo solo hay estado offline (sin copia sintética) y conserva requestId sin secretos")]
    public async Task OfflineBridge()
    {
        using var configuration = AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture()));
        var channel = new AgentChannel(configuration, new AgentLog(Path.GetTempPath()));
        var state = new AgentState(configuration.PcId);
        using var bridge = new AgentHostBridge(channel, state, configuration.PcName); bridge.Subscribe();
        using var process = Process.GetCurrentProcess(); using var retained = new RetainedProcess(process);
        var name = PipeEndpoints.NewName(); using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var running = bridge.RunForHostAsync(process, name, stop.Token);
        try
        {
            using var client = await PipeEndpoints.Connect(name, retained, stop.Token);
            var status = ProtocolValidation.Parse(await PipeFrames.ReadAsync(client, "bridge-event", stop.Token), "bridge-event");
            Assert.Equal("offline", status.GetProperty("status").GetString());
            // El siguiente frame es la respuesta al login: ningún «locked» inventado antes del nodo.
            await PipeFrames.WriteAsync(client, "{\"type\":\"login\",\"requestId\":\"prueba\",\"username\":\"ana\",\"password\":\"secreto-ficticio\"}"u8.ToArray(), "shell-request", stop.Token);
            var response = await PipeFrames.ReadAsync(client, "bridge-event", stop.Token);
            var message = ProtocolValidation.Parse(response, "bridge-event").GetProperty("message");
            Assert.Equal("prueba", message.GetProperty("requestId").GetString());
            Assert.Equal("internal_error", message.GetProperty("code").GetString());
            Assert.DoesNotContain("secreto-ficticio", System.Text.Encoding.UTF8.GetString(response));
            Assert.DoesNotContain(configuration.Authorization(), System.Text.Encoding.UTF8.GetString(response));
            CryptographicOperations.ZeroMemory(response);
        }
        finally { stop.Cancel(); try { await running; } catch (OperationCanceledException) { } }
    }

    [Fact(DisplayName = "REQ-003-20/T32: el host recibe el mensaje, su confirmación lo da por mostrado y nunca llega al nodo")]
    public async Task StaffMessageConfirmedByHost()
    {
        using var configuration = AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture()));
        var channel = new AgentChannel(configuration, new AgentLog(Path.GetTempPath()));
        var state = new AgentState(configuration.PcId);
        using var bridge = new AgentHostBridge(channel, state, configuration.PcName); bridge.Subscribe();
        const string id = "01900000-0000-7000-8000-000000000320";
        Assert.Null(await bridge.ShowStaffMessageAsync(id, "Sin host", TimeSpan.FromSeconds(1), CancellationToken.None));
        using var process = Process.GetCurrentProcess(); using var retained = new RetainedProcess(process);
        var name = PipeEndpoints.NewName(); using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var running = bridge.RunForHostAsync(process, name, stop.Token);
        try
        {
            using var client = await PipeEndpoints.Connect(name, retained, stop.Token);
            await PipeFrames.ReadAsync(client, "bridge-event", stop.Token); // estado offline
            var shown = bridge.ShowStaffMessageAsync(id, "<b>Hola</b>", TimeSpan.FromSeconds(4), stop.Token);
            var message = ProtocolValidation.Parse(await PipeFrames.ReadAsync(client, "bridge-event", stop.Token), "bridge-event");
            Assert.Equal("staffMessage", message.GetProperty("kind").GetString());
            Assert.Equal("<b>Hola</b>", message.GetProperty("text").GetString());
            await PipeFrames.WriteAsync(client, JsonSerializer.SerializeToUtf8Bytes(new { type = "staffMessageShown", commandId = id }), "shell-request", stop.Token);
            Assert.True(await shown);
            // Si la confirmación se hubiera reenviado al nodo (sin conexión), su error llegaría antes.
            await PipeFrames.WriteAsync(client, "{\"type\":\"login\",\"requestId\":\"siguiente\",\"username\":\"ana\",\"password\":\"x\"}"u8.ToArray(), "shell-request", stop.Token);
            var next = ProtocolValidation.Parse(await PipeFrames.ReadAsync(client, "bridge-event", stop.Token), "bridge-event");
            Assert.Equal("siguiente", next.GetProperty("message").GetProperty("requestId").GetString());
        }
        finally { stop.Cancel(); try { await running; } catch (OperationCanceledException) { } }
    }

    [Theory(DisplayName = "REQ-003-44/T40: «Terminar y bloquear» del host se atiende en el agente sin pasar por el nodo")]
    [InlineData(true, "maintenanceState")]
    [InlineData(false, "error")]
    public async Task EndMaintenanceFromHostIsHandledLocally(bool done, string expected)
    {
        using var configuration = AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture()));
        var channel = new AgentChannel(configuration, new AgentLog(Path.GetTempPath()));
        var state = new AgentState(configuration.PcId);
        using var bridge = new AgentHostBridge(channel, state, configuration.PcName); bridge.Subscribe();
        string? ended = null;
        bridge.EndMaintenance = (id, _) => { ended = id; return Task.FromResult(done); };
        using var process = Process.GetCurrentProcess(); using var retained = new RetainedProcess(process);
        var name = PipeEndpoints.NewName(); using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var running = bridge.RunForHostAsync(process, name, stop.Token);
        try
        {
            using var client = await PipeEndpoints.Connect(name, retained, stop.Token);
            await PipeFrames.ReadAsync(client, "bridge-event", stop.Token); // estado offline
            const string requestId = "01900000-0000-7000-8000-000000000160";
            const string maintenanceId = "01900000-0000-7000-8000-0000000000aa";
            await PipeFrames.WriteAsync(client, JsonSerializer.SerializeToUtf8Bytes(new { type = "endMaintenance", requestId, maintenanceId }), "shell-request", stop.Token);
            var message = ProtocolValidation.Parse(await PipeFrames.ReadAsync(client, "bridge-event", stop.Token), "bridge-event").GetProperty("message");
            Assert.Equal(expected, message.GetProperty("type").GetString());
            Assert.Equal(requestId, message.GetProperty("requestId").GetString());
            Assert.Equal(maintenanceId, ended);
            if (done) Assert.Equal(JsonValueKind.Null, message.GetProperty("maintenance").ValueKind);
        }
        finally { stop.Cancel(); try { await running; } catch (OperationCanceledException) { } }
    }
}
