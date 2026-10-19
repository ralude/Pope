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
}
