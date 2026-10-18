using System.Text.Json;
using Pope.Agent;
using Xunit;

namespace Pope.Native.Tests;

public sealed class AgentLifetimeTests
{
    [Fact(DisplayName = "REQ-003-02: un trabajo que ignora cancelación no bloquea la parada indefinidamente")]
    public void StopHasDeadline()
    {
        var root = Path.Combine(Path.GetTempPath(), "pope-stop-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            using var lifetime = new AgentLifetime(new AgentLog(root),
                () => AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture())),
                (_, _) => release.Task, TimeSpan.FromMilliseconds(20));
            try
            {
                lifetime.Start();
                Assert.Throws<TimeoutException>(() => lifetime.Stop());
                Assert.True(lifetime.Failed);
            }
            finally
            {
                release.SetResult();
                Assert.True(SpinWait.SpinUntil(() =>
                {
                    try { lifetime.Stop(); return true; }
                    catch (TimeoutException) { return false; }
                }, 2000));
            }
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact(DisplayName = "REQ-003-02: un único trabajo, parada cancelable y credencial descartada")]
    public void StopIsClean()
    {
        var root = Path.Combine(Path.GetTempPath(), "pope-lifetime-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var configuration = AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture()));
            var calls = 0;
            using var lifetime = new AgentLifetime(new AgentLog(root), () => configuration, async (_, token) =>
            {
                Interlocked.Increment(ref calls);
                await Task.Delay(Timeout.InfiniteTimeSpan, token);
            });
            lifetime.Start();
            // Task.Run puede tardar con el pool ocupado por otros tests en paralelo; el margen no ralentiza el éxito.
            Assert.True(SpinWait.SpinUntil(() => Volatile.Read(ref calls) == 1, 10_000));
            Assert.Throws<InvalidOperationException>(() => lifetime.Start());
            lifetime.Stop(); lifetime.Stop();
            Assert.Equal(1, calls);
            Assert.False(lifetime.Failed);
            Assert.Throws<ObjectDisposedException>(() => configuration.Authorization());
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact(DisplayName = "REQ-003-02/63: fallos de carga y trabajo no se copian a logs")]
    public void FailuresAreSanitized()
    {
        var root = Path.Combine(Path.GetTempPath(), "pope-failure-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            using var invalid = new AgentLifetime(new AgentLog(root), () => throw new InvalidDataException("secreto"), (_, _) => Task.CompletedTask);
            Assert.Throws<InvalidDataException>(() => invalid.Start());
            using var failing = new AgentLifetime(new AgentLog(root),
                () => AgentConfiguration.Parse(JsonSerializer.SerializeToUtf8Bytes(AgentConfigurationTests.Fixture())),
                (_, _) => throw new IOException("secreto"));
            using var failed = new ManualResetEventSlim();
            failing.Failure += failed.Set;
            failing.Start();
            Assert.True(failed.Wait(2000));
            failing.Stop();
            Assert.True(failing.Failed);
            Assert.DoesNotContain("secreto", File.ReadAllText(Path.Combine(root, "agent.log")));
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}
