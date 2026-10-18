using Pope.ShellHost;
using Xunit;

namespace Pope.Native.Tests;

public sealed class PauseAudioTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "pope-audio-" + Guid.NewGuid().ToString("N"));
    private string Journal => Path.Combine(root, "PauseAudio.json");
    public void Dispose() { if (Directory.Exists(root)) Directory.Delete(root, true); }

    [Fact(DisplayName = "REQ-002-07: la pausa silencia todas las salidas y reanudar devuelve el mute previo, sin tocar el volumen")]
    public void MutesAndRestores()
    {
        var devices = new Devices { ["altavoces"] = false, ["auriculares"] = true };
        var audio = new PauseAudio(devices, Journal);
        Assert.False(audio.Cycle(paused: false)); Assert.Empty(devices.Calls);
        Assert.True(audio.Cycle(paused: true));
        Assert.True(devices["altavoces"]); Assert.True(devices["auriculares"]);
        Assert.Equal(["altavoces=True"], devices.Calls);
        Assert.True(File.Exists(Journal));
        Assert.False(audio.Cycle(paused: false));
        Assert.False(devices["altavoces"]); Assert.True(devices["auriculares"]);
        Assert.False(File.Exists(Journal)); Assert.Null(audio.Captured);
    }

    [Fact(DisplayName = "REQ-002-07/30: host reiniciado o reconexión no recapturan el silencio puesto por Pope")]
    public void RestartKeepsOriginals()
    {
        var devices = new Devices { ["altavoces"] = false };
        new PauseAudio(devices, Journal).Cycle(paused: true);
        Assert.True(devices["altavoces"]);
        var restarted = new PauseAudio(devices, Journal); restarted.Load();
        restarted.Cycle(paused: true); restarted.Cycle(paused: true);
        Assert.False(restarted.Captured!["altavoces"]);
        restarted.Cycle(paused: false);
        Assert.False(devices["altavoces"]);
        // Un host nuevo que arranca sin pausa restaura lo que dejó el anterior.
        new PauseAudio(devices, Journal).Cycle(paused: true);
        var unpaused = new PauseAudio(devices, Journal); unpaused.Load();
        Assert.False(unpaused.Cycle(paused: false)); Assert.False(devices["altavoces"]);
    }

    [Fact(DisplayName = "REQ-002-07: una salida nueva en pausa se silencia y una desconectada se restaura al volver")]
    public void OutputChanges()
    {
        var devices = new Devices { ["altavoces"] = false };
        var audio = new PauseAudio(devices, Journal);
        audio.Cycle(paused: true);
        devices["usb"] = false; audio.Cycle(paused: true);
        Assert.True(devices["usb"]);
        devices["altavoces"] = false; audio.Cycle(paused: true);
        Assert.True(devices["altavoces"]);
        devices.Unplug("usb");
        Assert.True(audio.Cycle(paused: false));
        Assert.False(devices["altavoces"]); Assert.True(File.Exists(Journal));
        devices.Plug("usb", muted: true);
        Assert.False(audio.Cycle(paused: false));
        Assert.False(devices["usb"]); Assert.False(File.Exists(Journal));
    }

    [Fact(DisplayName = "REQ-002-07: un fallo de una salida no detiene las demás y se reintenta")]
    public void FailingDeviceIsRetried()
    {
        var devices = new Devices { ["roto"] = false, ["altavoces"] = false };
        var audio = new PauseAudio(devices, Journal);
        devices.Failing = "roto";
        audio.Cycle(paused: true);
        Assert.False(devices["roto"]); Assert.True(devices["altavoces"]);
        devices.Failing = null; audio.Cycle(paused: true);
        Assert.True(devices["roto"]);
        devices.Failing = "roto";
        Assert.True(audio.Cycle(paused: false));
        devices.Failing = null;
        Assert.False(audio.Cycle(paused: false)); Assert.False(devices["roto"]);
    }

    [Theory(DisplayName = "REQ-002-07: diario corrupto o con campos ajenos se descarta sin inventar originales")]
    [InlineData("{")]
    [InlineData("{\"version\":2,\"devices\":[]}")]
    [InlineData("{\"version\":1,\"devices\":[{\"id\":\"a\",\"muted\":true,\"volumen\":1}]}")]
    [InlineData("{\"version\":1,\"devices\":[{\"id\":\"a\",\"muted\":true},{\"id\":\"a\",\"muted\":false}]}")]
    [InlineData("{\"version\":1,\"devices\":[{\"id\":\"\",\"muted\":true}]}")]
    public void CorruptJournal(string content)
    {
        Directory.CreateDirectory(root); File.WriteAllText(Journal, content);
        var audio = new PauseAudio(new Devices(), Journal); audio.Load();
        Assert.Null(audio.Captured); Assert.False(File.Exists(Journal));
    }

    private sealed class Devices : IAudioEndpoints
    {
        private readonly Dictionary<string, bool> active = [];
        private readonly Dictionary<string, bool> unplugged = [];
        internal List<string> Calls { get; } = [];
        internal string? Failing;
        internal bool this[string id] { get => active[id]; set => active[id] = value; }
        internal void Unplug(string id) { unplugged[id] = active[id]; active.Remove(id); }
        internal void Plug(string id, bool muted) { unplugged.Remove(id); active[id] = muted; }
        public IReadOnlyList<AudioEndpoint> Active() => active.Select(p => new AudioEndpoint(p.Key, p.Value)).ToList();
        public void SetMute(string id, bool muted)
        {
            if (id == Failing) throw new System.Runtime.InteropServices.COMException("Salida no disponible", unchecked((int)0x88890004));
            Calls.Add($"{id}={muted}"); active[id] = muted;
        }
    }
}
