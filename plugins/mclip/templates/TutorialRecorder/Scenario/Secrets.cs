using System.Text.Json;

namespace TutorialRecorder.Scenario;

/// <summary>
/// Credentials by userKey, from tutorial.secrets.json (git-ignored, beside the tool or given by --secrets) and then
/// environment variables TUTORIAL_{KEY}_{FIELD} (e.g. TUTORIAL_ADMIN_PASSWORD), which win.
/// </summary>
public sealed class Secrets
{
    readonly Dictionary<string, Dictionary<string, string>> users = new(StringComparer.OrdinalIgnoreCase);

    public static Secrets Load(string? path)
    {
        var s = new Secrets();
        if (path is not null && File.Exists(path))
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            if (doc.RootElement.TryGetProperty("users", out var us))
                foreach (var u in us.EnumerateObject())
                    s.users[u.Name] = u.Value.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? "", StringComparer.OrdinalIgnoreCase);
        }
        return s;
    }

    public string? Get(string userKey, string field)
    {
        var env = Environment.GetEnvironmentVariable($"TUTORIAL_{userKey.ToUpperInvariant()}_{field.ToUpperInvariant()}");
        if (!string.IsNullOrEmpty(env)) return env;
        return users.TryGetValue(userKey, out var u) && u.TryGetValue(field, out var v) ? v : null;
    }

    public bool Has(string userKey) => Get(userKey, "email") is not null && Get(userKey, "password") is not null;
}
