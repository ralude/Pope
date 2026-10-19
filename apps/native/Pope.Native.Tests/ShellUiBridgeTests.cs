using System.Diagnostics;
using System.Net.WebSockets;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class ShellUiBridgeTests
{
    [Fact(DisplayName = "REQ-003-03/04/63: React real cruza host/pipe/WSS con correlación y reconexión")]
    public async Task ReactThroughAuthenticatedWss()
    {
        using var peer = new AgentChannelTests.Peer(); using var configuration = peer.Configuration();
        var root = Path.Combine(Path.GetTempPath(), "pope-shell-chain-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var proof = Path.Combine(root, "proof"); var name = PipeEndpoints.NewName();
        var state = new AgentState(configuration.PcId);
        var channel = new AgentChannel(configuration, new AgentLog(root)) { Hello = state.Hello, Heartbeat = state.Heartbeat };
        channel.Message += state.Apply;
        using var bridge = new AgentHostBridge(channel, state, configuration.PcName); bridge.Subscribe();
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        using var firstPipe = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
        using var secondPipe = CancellationTokenSource.CreateLinkedTokenSource(stop.Token);
        var channelTask = channel.RunAsync(stop.Token);
        using var process = Start(proof, name);
        var pipeTask = bridge.RunForHostAsync(process, name, firstPipe.Token);
        try
        {
            using var socket = await peer.Accept(configuration.Authorization(), stop.Token);
            var hello = await AgentChannelTests.Read(socket, stop.Token);
            Assert.Equal("unknown", hello.GetProperty("recoveryState").GetString());
            await Send(socket, new { type = "state", status = "locked" }, stop.Token);
            var login = await Login(socket, process, proof, stop.Token);
            await Send(socket, new { type = "error", code = "invalid_credentials", message = "Respuesta ajena", requestId = "another-request" }, stop.Token);
            await Send(socket, new { type = "error", code = "invalid_credentials", message = "Prueba correlacionada", requestId = login.GetProperty("requestId").GetString() }, stop.Token);
            var retry = await Login(socket, process, proof, stop.Token);
            Assert.NotEqual(login.GetProperty("requestId").GetString(), retry.GetProperty("requestId").GetString());
            await Send(socket, new
            {
                type = "state",
                status = "active",
                vesRate = (object?)null,
                requestId = retry.GetProperty("requestId").GetString(),
                session = new { kind = "temporary", sessionId = "01900000-0000-7000-8000-000000000124", startedAt = "2026-10-11T00:00:00Z", name = "Cliente del ensayo", purchasedSeconds = 120, remainingSeconds = 120 }
            }, stop.Token);
            await Marker(proof, "active", process, stop.Token);
            firstPipe.Cancel(); await IgnoreCancellation(pipeTask);
            await Marker(proof, "offline", process, stop.Token);
            pipeTask = bridge.RunForHostAsync(process, name, secondPipe.Token);
            await process.WaitForExitAsync(stop.Token);
            var report = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(proof, "report.json"), stop.Token));
            using (report) Assert.True(report.RootElement.GetProperty("Passed").GetBoolean(), report.RootElement.GetRawText());
            Assert.Equal(0, process.ExitCode);
            Assert.False(state.Blocked); Assert.InRange(state.RemainingSeconds!.Value, 1, 119);
        }
        finally
        {
            stop.Cancel(); if (!process.HasExited) { process.Kill(true); await process.WaitForExitAsync(); }
            await IgnoreCancellation(pipeTask); await IgnoreCancellation(channelTask);
            var evidence = Environment.GetEnvironmentVariable("POPE_NATIVE_PROOF_DIR");
            if (evidence != null && Path.IsPathFullyQualified(evidence) && !Directory.Exists(evidence))
            {
                Directory.CreateDirectory(evidence);
                foreach (var file in new[] { "report.json", "session.png" })
                    if (File.Exists(Path.Combine(proof, file))) File.Copy(Path.Combine(proof, file), Path.Combine(evidence, file));
            }
            for (var attempt = 0; attempt < 20 && Directory.Exists(root); attempt++)
            {
                try { Directory.Delete(root, true); } catch (Exception error) when (error is IOException or UnauthorizedAccessException) { await Task.Delay(100); }
            }
        }
    }
    private static async Task<JsonElement> Login(WebSocket socket, Process process, string directory, CancellationToken token)
    {
        JsonElement request;
        do
        {
            var reading = AgentChannelTests.Read(socket, token);
            await Task.WhenAny(reading, process.WaitForExitAsync(token));
            Assert.False(process.HasExited, File.Exists(Path.Combine(directory, "report.json")) ? File.ReadAllText(Path.Combine(directory, "report.json")) : "Host terminó antes del login.");
            request = await reading;
        } while (request.GetProperty("type").GetString() == "heartbeat");
        Assert.Equal("login", request.GetProperty("type").GetString()); Assert.Equal("ana", request.GetProperty("username").GetString());
        Assert.Equal("ficticia-de-ensayo", request.GetProperty("password").GetString()); return request;
    }
    private static Task Send(WebSocket socket, object message, CancellationToken token) => socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(message).AsMemory(), WebSocketMessageType.Text, true, token).AsTask();
    private static async Task Marker(string directory, string marker, Process process, CancellationToken token)
    {
        while (!File.Exists(Path.Combine(directory, marker)))
        { Assert.False(process.HasExited, File.Exists(Path.Combine(directory, "report.json")) ? File.ReadAllText(Path.Combine(directory, "report.json")) : "Host terminó antes del ensayo."); await Task.Delay(50, token); }
    }
    private static async Task IgnoreCancellation(Task task) { try { await task; } catch (OperationCanceledException) { } }
    private static Process Start(string directory, string pipe)
    {
        var path = Path.GetFullPath("../../../../../Pope.DesktopProbe/bin/Release/net10.0-windows/win-x64/Pope.DesktopProbe.exe", AppContext.BaseDirectory);
        var info = new ProcessStartInfo(path) { UseShellExecute = false, CreateNoWindow = true };
        foreach (var argument in new[] { "--shell-channel-proof", directory, pipe, Environment.ProcessId.ToString() }) info.ArgumentList.Add(argument);
        return Process.Start(info)!;
    }
}
