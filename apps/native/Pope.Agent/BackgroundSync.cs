using System.Text.Json;

namespace Pope.Agent;

// REQ-003-72/73: el aviso del nodo solo trae metadatos. El agente descarga la imagen y, solo cuando
// está verificada en esta PC, avisa al host; el host y el Shell nunca ven el aviso crudo del nodo.
internal sealed class BackgroundSync(
    Func<string, long, CancellationToken, Task> download, Action<JsonElement> applied, Func<string, long, bool>? installed = null)
{
    private Task pending = Task.CompletedTask;

    /// <summary>La última descarga en curso (o terminada): las pruebas y el cierre la esperan.</summary>
    internal Task Pending => pending;

    /// <summary>Se suscribe al canal. No bloquea: la descarga corre aparte, sin frenar los latidos.</summary>
    internal void OnMessage(JsonElement message)
    {
        if (message.GetProperty("type").GetString() != "lockBackground") return;
        pending = ApplyAsync(message.Clone(), CancellationToken.None);
    }

    private async Task ApplyAsync(JsonElement message, CancellationToken token)
    {
        try
        {
            var image = message.GetProperty("background");
            // Sin imagen (valor inicial o fondo quitado): el Shell usa el de Pope; no hay nada que bajar.
            if (image.ValueKind == JsonValueKind.Null) { applied(message); return; }
            var sha256 = image.GetProperty("sha256").GetString()!;
            var size = image.GetProperty("size").GetInt64();
            // El nodo repite el aviso en cada hello: lo ya instalado solo se comunica, no se baja otra vez.
            if (installed?.Invoke(sha256, size) != true) await download(sha256, size, token);
            applied(message);
        }
        catch (Exception) when (!token.IsCancellationRequested)
        {
            // Descarga fallida o imagen que no coincide: no se avisa y se conserva lo anterior.
            // Los reintentos y su registro son de la historia 5; aquí no se filtra ningún detalle.
        }
    }
}
