using System.Runtime.InteropServices;

namespace Pope.ShellHost;

// REQ-002-07: Core Audio de Windows por COM, sin paquetes. Solo salidas (eRender) activas y su
// mute; el volumen se lee para verificar que no cambia. Usar desde un hilo MTA propio.
internal sealed class CoreAudioEndpoints : IAudioEndpoints
{
    // Contexto propio en las notificaciones de Windows: identifica los cambios hechos por Pope.
    private static readonly Guid Context = new("6f5bb3c1-2d0e-4a8e-9a43-5c0c7a1e2b07");
    private const int Render = 0;      // eRender: salidas, no micrófonos.
    private const uint ActiveState = 1; // DEVICE_STATE_ACTIVE: presentes y habilitadas.
    private const uint InProcess = 23;  // CLSCTX_ALL, como en la documentación de Activate.

    public IReadOnlyList<AudioEndpoint> Active()
    {
        var list = new List<AudioEndpoint>();
        Each((id, volume) => { volume.GetMute(out var muted); list.Add(new AudioEndpoint(id, muted)); });
        return list;
    }

    public void SetMute(string id, bool muted)
    {
        var context = Context;
        With(id, volume => volume.SetMute(muted, ref context));
    }

    internal float Volume(string id)
    {
        var level = 0f;
        With(id, volume => volume.GetMasterVolumeLevelScalar(out level));
        return level;
    }

    private static void Each(Action<string, IAudioEndpointVolume> action)
    {
        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
        try
        {
            enumerator.EnumAudioEndpoints(Render, ActiveState, out var collection);
            try
            {
                collection.GetCount(out var count);
                for (var index = 0u; index < Math.Min(count, 256u); index++)
                {
                    collection.Item(index, out var device);
                    try { device.GetId(out var id); Activate(device, volume => action(id, volume)); }
                    finally { Marshal.ReleaseComObject(device); }
                }
            }
            finally { Marshal.ReleaseComObject(collection); }
        }
        finally { Marshal.ReleaseComObject(enumerator); }
    }

    private static void With(string id, Action<IAudioEndpointVolume> action)
    {
        var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
        try
        {
            enumerator.GetDevice(id, out var device);
            try { Activate(device, action); }
            finally { Marshal.ReleaseComObject(device); }
        }
        finally { Marshal.ReleaseComObject(enumerator); }
    }

    private static void Activate(IMMDevice device, Action<IAudioEndpointVolume> action)
    {
        var iid = typeof(IAudioEndpointVolume).GUID;
        device.Activate(ref iid, InProcess, 0, out var created);
        try { action((IAudioEndpointVolume)created); }
        finally { Marshal.ReleaseComObject(created); }
    }

    // Enumerador de dispositivos multimedia de Windows (MMDeviceEnumerator).
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumerator;

    // IMMDeviceEnumerator: lista las salidas y abre una por su ID estable.
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        void EnumAudioEndpoints(int flow, uint states, out IMMDeviceCollection devices);
        void GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
        void GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    }

    // IMMDeviceCollection: colección de salidas de la consulta anterior.
    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceCollection
    {
        void GetCount(out uint count);
        void Item(uint index, out IMMDevice device);
    }

    // IMMDevice: ID de la salida y activación de su control de volumen.
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        void Activate(ref Guid iid, uint context, nint parameters, [MarshalAs(UnmanagedType.IUnknown)] out object created);
        void OpenPropertyStore(uint access, out nint store);
        void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        void GetState(out uint state);
    }

    // IAudioEndpointVolume: el orden de la tabla virtual debe coincidir con endpointvolume.h.
    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume
    {
        void RegisterControlChangeNotify(nint notify);
        void UnregisterControlChangeNotify(nint notify);
        void GetChannelCount(out uint count);
        void SetMasterVolumeLevel(float level, ref Guid context);
        void SetMasterVolumeLevelScalar(float level, ref Guid context);
        void GetMasterVolumeLevel(out float level);
        void GetMasterVolumeLevelScalar(out float level);
        void SetChannelVolumeLevel(uint channel, float level, ref Guid context);
        void SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
        void GetChannelVolumeLevel(uint channel, out float level);
        void GetChannelVolumeLevelScalar(uint channel, out float level);
        void SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid context);
        void GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
    }
}
