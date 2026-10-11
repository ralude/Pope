using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Pope.Agent;

// REQ-003-63: interpreta únicamente el subconjunto exportado de shared, sin reglas de negocio.
internal static class ProtocolValidation
{
    internal const int MaximumBytes = 16_384;
    private static readonly HashSet<string> Keywords = ["$schema", "type", "properties", "required", "additionalProperties",
        "anyOf", "oneOf", "const", "enum", "minimum", "maximum", "exclusiveMinimum", "minLength", "maxLength", "pattern", "format", "items", "minItems", "maxItems"];
    private static readonly JsonElement Contracts = Load();

    internal static JsonElement Parse(ReadOnlyMemory<byte> bytes, string contract)
    {
        try
        {
            if (bytes.Length is < 1 or > MaximumBytes) throw new InvalidDataException();
            using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 32 });
            var value = document.RootElement;
            if (!Valid(Contracts.GetProperty(contract), value)) throw new InvalidDataException();
            return value.Clone();
        }
        catch { throw new InvalidDataException("Mensaje del protocolo no válido."); }
    }

    private static JsonElement Load()
    {
        using var stream = typeof(ProtocolValidation).Assembly.GetManifestResourceStream("protocol.v2")!;
        using var document = JsonDocument.Parse(stream);
        foreach (var contract in document.RootElement.EnumerateObject()) CheckKeywords(contract.Value);
        return document.RootElement.Clone();
    }

    private static void CheckKeywords(JsonElement schema)
    {
        foreach (var property in schema.EnumerateObject())
        {
            if (!Keywords.Contains(property.Name)) throw new InvalidDataException("Contrato exportado no compatible.");
            if (property.Name == "properties") foreach (var field in property.Value.EnumerateObject()) CheckKeywords(field.Value);
            if (property.Name is "anyOf" or "oneOf") foreach (var branch in property.Value.EnumerateArray()) CheckKeywords(branch);
            if (property.Name == "items") CheckKeywords(property.Value);
        }
    }

    private static bool Valid(JsonElement schema, JsonElement value)
    {
        if (schema.TryGetProperty("anyOf", out var any) && !any.EnumerateArray().Any(s => Valid(s, value))) return false;
        if (schema.TryGetProperty("oneOf", out var one) && one.EnumerateArray().Count(s => Valid(s, value)) != 1) return false;
        if (schema.TryGetProperty("const", out var constant) && !JsonElement.DeepEquals(constant, value)) return false;
        if (schema.TryGetProperty("enum", out var choices) && !choices.EnumerateArray().Any(c => JsonElement.DeepEquals(c, value))) return false;
        if (schema.TryGetProperty("type", out var type) && !MatchesType(type.GetString()!, value)) return false;
        switch (value.ValueKind)
        {
            case JsonValueKind.Object:
                var fields = value.EnumerateObject().ToArray();
                if (fields.Select(f => f.Name).Distinct().Count() != fields.Length) return false;
                if (schema.TryGetProperty("required", out var required) && required.EnumerateArray().Any(r => !value.TryGetProperty(r.GetString()!, out _))) return false;
                if (schema.TryGetProperty("properties", out var properties))
                    foreach (var field in fields)
                    {
                        if (properties.TryGetProperty(field.Name, out var child)) { if (!Valid(child, field.Value)) return false; }
                        else if (schema.TryGetProperty("additionalProperties", out var extra) && extra.ValueKind == JsonValueKind.False) return false;
                    }
                break;
            case JsonValueKind.Array:
                if (!Bounds(schema, value.GetArrayLength(), "minItems", "maxItems")) return false;
                if (schema.TryGetProperty("items", out var item) && value.EnumerateArray().Any(v => !Valid(item, v))) return false;
                break;
            case JsonValueKind.String:
                var text = value.GetString()!;
                // JSON Schema mide puntos de código Unicode, no unidades UTF-16.
                if (!Bounds(schema, text.EnumerateRunes().Count(), "minLength", "maxLength")) return false;
                if (schema.TryGetProperty("pattern", out var pattern) && !Regex.IsMatch(text, pattern.GetString()!, RegexOptions.ECMAScript, TimeSpan.FromMilliseconds(100))) return false;
                if (schema.TryGetProperty("format", out var format) && !ValidFormat(format.GetString()!, text)) return false;
                break;
            case JsonValueKind.Number:
                if (!value.TryGetDecimal(out var number) || !Bounds(schema, number, "minimum", "maximum")) return false;
                if (schema.TryGetProperty("exclusiveMinimum", out var exclusive) && number <= exclusive.GetDecimal()) return false;
                break;
        }
        return true;
    }

    private static bool MatchesType(string type, JsonElement value) => type switch
    {
        "object" => value.ValueKind == JsonValueKind.Object,
        "array" => value.ValueKind == JsonValueKind.Array,
        "string" => value.ValueKind == JsonValueKind.String,
        "number" => value.ValueKind == JsonValueKind.Number,
        "integer" => value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var n) && decimal.Truncate(n) == n,
        "null" => value.ValueKind == JsonValueKind.Null,
        "boolean" => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
        _ => false
    };
    private static bool Bounds(JsonElement schema, decimal value, string minimum, string maximum) =>
        (!schema.TryGetProperty(minimum, out var min) || value >= min.GetDecimal()) &&
        (!schema.TryGetProperty(maximum, out var max) || value <= max.GetDecimal());
    private static bool ValidFormat(string format, string value) => format switch
    {
        "uuid" => Guid.TryParseExact(value, "D", out _),
        "date-time" => DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out _),
        _ => false
    };
}
