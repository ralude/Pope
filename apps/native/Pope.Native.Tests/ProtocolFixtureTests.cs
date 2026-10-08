using System.Text.Json.Nodes;
using Json.Schema;
using Xunit;

namespace Pope.Native.Tests;

public sealed class ProtocolFixtureTests
{
    private static readonly string ProtocolPath = Path.Combine(AppContext.BaseDirectory, "protocol");
    private static readonly JsonArray Fixtures = (JsonArray)Read("fixtures.json");
    private static readonly JsonObject Normalization = (JsonObject)Read("normalization.json");
    private static readonly Dictionary<string, JsonSchema> Schemas = LoadSchemas();

    public static IEnumerable<object[]> Cases() => Fixtures.Select(f => new object[] { f!["id"]!.GetValue<string>() });

    [Theory(DisplayName = "REQ-003-63: fixtures Zod/JSON Schema coinciden en C#")]
    [MemberData(nameof(Cases))]
    public void SharedContractMatches(string id)
    {
        var fixture = Fixtures.Single(f => f!["id"]!.GetValue<string>() == id)!;
        var original = fixture["input"];
        var input = original?.DeepClone();
        var version = fixture["version"]!.GetValue<string>();
        var contract = fixture["contract"]!.GetValue<string>();
        Normalize(version, contract, input);
        var expected = fixture["valid"]!.GetValue<bool>();
        var result = Schemas[$"{version}/{contract}"].Evaluate(input, new EvaluationOptions
        {
            EvaluateAs = SpecVersion.Draft202012,
            RequireFormatValidation = true
        });

        // No imprimir input ni errores del validador: un fixture futuro podría contener secretos.
        Assert.True(result.IsValid == expected, $"REQ-003-63: {id}, esperado {expected}, obtenido {result.IsValid}");
        if (fixture["normalizedUsername"] is JsonValue username)
            Assert.Equal(username.GetValue<string>(), input!["username"]!.GetValue<string>());
        if (original is JsonObject obj && obj.ContainsKey("password"))
            Assert.True(JsonNode.DeepEquals(original["password"], input!["password"]));
    }

    [Fact(DisplayName = "REQ-003-63: todos los contratos tienen casos válidos e inválidos")]
    public void EveryContractHasBothOutcomes()
    {
        Assert.Equal(Fixtures.Count, Fixtures.Select(f => f!["id"]!.GetValue<string>()).Distinct().Count());
        foreach (var key in Schemas.Keys)
        {
            var outcomes = Fixtures.Where(f => $"{f!["version"]}/{f["contract"]}" == key)
                .Select(f => f!["valid"]!.GetValue<bool>()).ToHashSet();
            Assert.True(outcomes.SetEquals([false, true]), $"REQ-003-63: cobertura incompleta en {key}");
        }
    }

    private static void Normalize(string version, string contract, JsonNode? input)
    {
        var acceptedVersion = Normalization["versions"]!.AsArray()
            .Any(v => $"v{v!.GetValue<int>()}" == version);
        if (!acceptedVersion || !Contains("contracts", contract) || input is not JsonObject obj)
            return;
        if (obj["type"] is not JsonValue type || !type.TryGetValue<string>(out var messageType)
            || !Contains("messageTypes", messageType))
            return;
        var field = Normalization["field"]!.GetValue<string>();
        if (obj[field] is not JsonValue value || !value.TryGetValue<string>(out var username))
            return;

        // Recorte ECMAScript exportado por shared; Trim() sin argumentos difiere de JS.
        var characters = Normalization["codePoints"]!.AsArray()
            .Select(p => checked((char)p!.GetValue<int>())).ToArray();
        obj[field] = username.Trim(characters);
    }

    private static bool Contains(string field, string value) => Normalization[field]!.AsArray()
        .Any(item => item!.GetValue<string>() == value);

    private static Dictionary<string, JsonSchema> LoadSchemas()
    {
        var schemas = new Dictionary<string, JsonSchema>();
        foreach (var version in new[] { "v1", "v2" })
            foreach (var pair in Read($"{version}/schemas.json").AsObject())
                schemas.Add($"{version}/{pair.Key}", JsonSchema.FromText(pair.Value!.ToJsonString()));
        return schemas;
    }

    private static JsonNode Read(string file) => JsonNode.Parse(File.ReadAllText(Path.Combine(ProtocolPath, file)))!;
}
