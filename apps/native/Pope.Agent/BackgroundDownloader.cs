using Pope.Bridge;

namespace Pope.Agent;

// REQ-003-73 / ADR-0017: solo el agente tiene la credencial de la PC, así que solo él descarga el
// fondo del nodo. Lo hace por el mismo transporte fijado que el WebSocket y entrega el cuerpo al
// almacén, que es quien comprueba la huella y el tamaño antes de dejar nada en disco.
internal sealed class BackgroundDownloader(AgentConfiguration configuration, BackgroundStore store, HttpMessageHandler? handler = null)
{
    internal async Task DownloadAsync(string sha256, long size, CancellationToken token)
    {
        // La huella forma la URL: se valida antes, para que nada ajeno llegue a la ruta.
        if (!BackgroundFiles.IsHash(sha256)) throw new InvalidDataException("Fondo no válido.");
        // `handler` solo lo inyectan las pruebas; en producto siempre es el transporte fijado.
        using var client = handler is null
            ? new HttpClient(NodeTransport.CreateHandler(() => configuration), disposeHandler: true)
            : new HttpClient(handler, disposeHandler: false);
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(configuration.NodeUrl, $"/lock-background/image/{sha256}"));
        // La credencial solo viaja en la cabecera, nunca en la URL.
        request.Headers.TryAddWithoutValidation("Authorization", configuration.Authorization());
        request.Headers.Accept.ParseAdd("image/webp");
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
        response.EnsureSuccessStatusCode();
        // Antes de leer nada: un tipo ajeno o un cuerpo más grande de lo anunciado no merece ni empezar.
        if (response.Content.Headers.ContentType?.MediaType != "image/webp" || response.Content.Headers.ContentLength > size)
            throw new InvalidDataException("Fondo no válido.");
        await using var content = await response.Content.ReadAsStreamAsync(token);
        await store.InstallAsync(content, sha256, size, token);
    }
}
