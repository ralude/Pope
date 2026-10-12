using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;
using Pope.Agent;
using Pope.Bridge;
using Xunit;

namespace Pope.Native.Tests;

public sealed class PipeAttackTests
{
    [Fact(DisplayName = "REQ-003-63: impostor del mismo logon no recibe estado; proceso muerto nunca coincide")]
    public async Task SameUserImpostor()
    {
        var name = PipeEndpoints.NewName();
        using var host = Start(name, "hold");
        Assert.Equal("PipePeerReady", await host.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5)));
        using var retained = new RetainedProcess(host);
        Assert.Equal((uint)host.Id, retained.Id);
        using var configuration = AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture()));
        var channel = new AgentChannel(configuration, new AgentLog(Path.GetTempPath()));
        using var bridge = new AgentHostBridge(channel, new AgentState(configuration.PcId), configuration.PcName);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var running = bridge.RunForHostAsync(host, name, stop.Token);
        try
        {
            using var impostor = Start(name, "denied");
            using var impostorIdentity = new RetainedProcess(impostor);
            Assert.Equal(retained.UserSid, impostorIdentity.UserSid);
            Assert.Equal(retained.LogonSid, impostorIdentity.LogonSid);
            await impostor.WaitForExitAsync(stop.Token);
            Assert.True(impostor.ExitCode == 0, await impostor.StandardError.ReadToEndAsync(stop.Token));
            var pid = retained.Id;
            host.Kill(); await host.WaitForExitAsync(stop.Token);
            Assert.True(SpinWait.SpinUntil(() => !retained.Alive, 2000));
            Assert.False(retained.Matches(pid));
        }
        finally
        {
            stop.Cancel(); if (!host.HasExited) { host.Kill(); await host.WaitForExitAsync(); }
            try { await running; } catch (OperationCanceledException) { }
        }
    }

    [Fact(DisplayName = "REQ-003-63: pipe Windows rechaza cliente de red aunque sea loopback")]
    public async Task RemoteClientRejected()
    {
        using var retained = new RetainedProcess(Process.GetCurrentProcess());
        var name = PipeEndpoints.NewName(); using var server = PipeEndpoints.Create(name, retained);
        using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var waiting = server.WaitForConnectionAsync(stop.Token);
        using var remote = new NamedPipeClientStream("127.0.0.1", name, PipeDirection.InOut, PipeOptions.Asynchronous);
        try
        {
            var rejected = false;
            try { await remote.ConnectAsync(500, stop.Token); }
            catch (Exception e) when (e is IOException or TimeoutException or UnauthorizedAccessException or OperationCanceledException) { rejected = true; }
            Assert.True(rejected); Assert.False(server.IsConnected);
        }
        finally { stop.Cancel(); try { await waiting; } catch (OperationCanceledException) { } }
    }

    private static Process Start(string name, string mode)
    {
        var path = Path.GetFullPath("../../../../../Pope.DesktopProbe/bin/Release/net10.0-windows/win-x64/Pope.DesktopProbe.exe", AppContext.BaseDirectory);
        var info = new ProcessStartInfo(path) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in new[] { "--pipe-peer", name, Environment.ProcessId.ToString(), mode }) info.ArgumentList.Add(argument);
        return Process.Start(info)!;
    }
}
