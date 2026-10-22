using Pope.Agent;
using Xunit;

namespace Pope.Native.Tests;

public sealed class MaintenanceExitJournalTests
{
    private static ExitEntry Entry(int n, long seconds = 120) => new(
        $"01900000-0000-7000-8000-{n:D12}", "01900000-0000-7000-8000-0000000000aa", "2026-10-22T20:00:00.000Z", seconds);

    [Fact(DisplayName = "REQ-003-44/T40: el diario guarda las salidas y se lee igual que se escribió")]
    public void RoundTrip()
    {
        IReadOnlyList<ExitEntry> entries = [Entry(1), Entry(2, 0)];
        Assert.Equal(entries, MaintenanceExitJournal.Parse(MaintenanceExitJournal.Serialize(entries)));
        Assert.Empty(MaintenanceExitJournal.Parse(MaintenanceExitJournal.Serialize([])));
    }

    [Fact(DisplayName = "REQ-003-44/T40: un ExitId repetido no cambia nada y una salida se quita por su ID")]
    public void AddIsIdempotentAndRemoveByExitId()
    {
        var (first, added) = MaintenanceExitJournal.TryAdd([], Entry(1));
        Assert.True(added);
        var (again, addedAgain) = MaintenanceExitJournal.TryAdd(first, Entry(1, 999));
        Assert.True(addedAgain);
        Assert.Equal(first, again);
        var (two, _) = MaintenanceExitJournal.TryAdd(again, Entry(2));
        Assert.Equal([Entry(2)], MaintenanceExitJournal.Remove(two, Entry(1).ExitId));
        Assert.Equal(two, MaintenanceExitJournal.Remove(two, "01900000-0000-7000-8000-0000000000ff"));
    }

    [Fact(DisplayName = "REQ-003-44/T40: con el diario lleno no se descarta ninguna salida pendiente")]
    public void FullJournalKeepsEveryEntry()
    {
        IReadOnlyList<ExitEntry> entries = [];
        for (var n = 1; n <= MaintenanceExitJournal.Capacity; n++) entries = MaintenanceExitJournal.TryAdd(entries, Entry(n)).Entries;
        Assert.Equal(MaintenanceExitJournal.Capacity, entries.Count);
        var (full, added) = MaintenanceExitJournal.TryAdd(entries, Entry(99));
        Assert.False(added);
        Assert.Equal(entries, full);
        // Al reconocer una, vuelve a caber otra.
        Assert.True(MaintenanceExitJournal.TryAdd(MaintenanceExitJournal.Remove(full, Entry(1).ExitId), Entry(99)).Added);
        Assert.Equal(entries, MaintenanceExitJournal.Parse(MaintenanceExitJournal.Serialize(entries)));
    }

    [Theory(DisplayName = "REQ-003-63/T40: un diario corrupto o con campos de más se rechaza sin mostrar su contenido")]
    [InlineData("")]
    [InlineData("no es json")]
    [InlineData("{\"version\":2,\"entries\":[]}")]
    [InlineData("{\"version\":1,\"entries\":[],\"extra\":1}")]
    [InlineData("{\"version\":1,\"entries\":[{\"exitId\":\"x\",\"maintenanceId\":\"01900000-0000-7000-8000-0000000000aa\",\"endedAt\":\"2026-10-22T20:00:00.000Z\",\"durationSeconds\":1}]}")]
    [InlineData("{\"version\":1,\"entries\":[{\"exitId\":\"01900000-0000-7000-8000-000000000001\",\"maintenanceId\":\"01900000-0000-7000-8000-0000000000aa\",\"endedAt\":\"ayer\",\"durationSeconds\":1}]}")]
    [InlineData("{\"version\":1,\"entries\":[{\"exitId\":\"01900000-0000-7000-8000-000000000001\",\"maintenanceId\":\"01900000-0000-7000-8000-0000000000aa\",\"endedAt\":\"2026-10-22T20:00:00.000Z\",\"durationSeconds\":-1}]}")]
    [InlineData("{\"version\":1,\"entries\":[{\"exitId\":\"01900000-0000-7000-8000-000000000001\",\"maintenanceId\":\"01900000-0000-7000-8000-0000000000aa\",\"endedAt\":\"2026-10-22T20:00:00.000Z\",\"durationSeconds\":1,\"actor\":\"Ana\"}]}")]
    public void RejectsCorruptJournal(string bad)
    {
        var error = Assert.Throws<InvalidDataException>(() => MaintenanceExitJournal.Parse(System.Text.Encoding.UTF8.GetBytes(bad)));
        Assert.DoesNotContain("Ana", error.Message);
    }

    [Fact(DisplayName = "REQ-003-44/T40: más entradas que la capacidad, o repetidas, se rechazan")]
    public void RejectsOversizeAndDuplicates()
    {
        var many = Enumerable.Range(1, MaintenanceExitJournal.Capacity + 1).Select(n => Entry(n)).ToList();
        Assert.Throws<InvalidDataException>(() => MaintenanceExitJournal.Parse(MaintenanceExitJournal.Serialize(many)));
        Assert.Throws<InvalidDataException>(() => MaintenanceExitJournal.Parse(MaintenanceExitJournal.Serialize([Entry(1), Entry(1)])));
    }
}
