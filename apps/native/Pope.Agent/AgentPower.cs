namespace Pope.Agent;

// T31 · REQ-003-20: reinicios y apagados con su diario durable. `initiate` pide el efecto a
// Windows y devuelve su código; `store` guarda el diario antes de cada efecto.
internal sealed class AgentPower(Func<string, int> initiate, IReadOnlyList<PowerEntry> saved, Action<IReadOnlyList<PowerEntry>> store)
{
    private IReadOnlyList<PowerEntry> entries = saved;

    internal PowerEntry? Find(string id) => entries.FirstOrDefault(entry => entry.Id == id);

    // Solo cambia la copia en memoria si el diario se guardó.
    internal void Record(PowerEntry entry)
    {
        var next = PowerJournal.With(entries, entry);
        store(next);
        entries = next;
    }

    internal int Initiate(string kind) => initiate(kind);
}
