using System.Text;

namespace Pope.Agent;

internal enum AgentLogCode { Started, Stopped, ConfigurationRejected, TransportDisconnected, TransportConnected, RuntimeFailed }

// REQ-003-63: códigos cerrados, nunca cuerpo, excepción, cabecera o contraseña.
internal sealed class AgentLog(string directory)
{
    internal const int MaximumBytes = 65_536;
    private readonly object gate = new();

    internal void Write(AgentLogCode code)
    {
        if (!Enum.IsDefined(code)) throw new ArgumentOutOfRangeException(nameof(code));
        var line = Encoding.UTF8.GetBytes($"{DateTime.UtcNow:O} {code}\n");
        lock (gate)
        {
            var path = Path.Combine(directory, "agent.log");
            // La carpeta protegida la prepara la custodia; no crear ubicaciones arbitrarias.
            if (File.Exists(path) && new FileInfo(path).Length > MaximumBytes) File.Delete(path);
            if (File.Exists(path + ".1") && new FileInfo(path + ".1").Length > MaximumBytes) File.Delete(path + ".1");
            if (File.Exists(path) && new FileInfo(path).Length + line.Length > MaximumBytes)
                File.Move(path, path + ".1", overwrite: true);
            using var file = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read);
            file.Write(line);
        }
    }
}
