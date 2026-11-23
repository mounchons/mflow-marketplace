using System.Text.RegularExpressions;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace TutorialRecorder.Scenario;

public static partial class ScenarioLoader
{
    static readonly HashSet<string> Actions =
    [
        "navigate", "click", "fill", "select", "check", "uncheck", "upload", "press", "wait",
        "zoom", "zoom-out", "login", "logout", "title",
    ];
    static readonly HashSet<string> NeedsTarget = ["click", "fill", "select", "check", "uncheck", "upload"];
    static readonly HashSet<string> Highlights = ["box", "arrow", "spotlight", "none"];
    static readonly HashSet<string> Placements = ["auto", "top", "bottom", "left", "right"];
    static readonly HashSet<string> Modes = ["caption", "callout", "both", "clean"];

    public static ScenarioFile Load(string path, Secrets secrets)
    {
        var yaml = File.ReadAllText(path);
        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(CamelCaseNamingConvention.Instance)
            .WithEnumNamingConvention(CamelCaseNamingConvention.Instance)
            .Build();
        var s = deserializer.Deserialize<ScenarioFile>(yaml) ?? throw new InvalidDataException("the scenario is empty");
        s.Login ??= new LoginDef();
        s.SourceDir = Path.GetDirectoryName(Path.GetFullPath(path))!;
        Validate(s, secrets);
        foreach (var step in s.Steps) step.Value = Expand(step.Value, secrets);
        return s;
    }

    static void Validate(ScenarioFile s, Secrets secrets)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(s.Clip) || !ClipName().IsMatch(s.Clip)) errors.Add("clip: a name of a-z, 0-9 and '-' is required");
        if (!Uri.TryCreate(s.BaseUrl, UriKind.Absolute, out _)) errors.Add("baseUrl: an absolute URL is required");
        if (!Modes.Contains(s.Mode)) errors.Add($"mode: '{s.Mode}' is not caption, callout, both or clean");
        foreach (var (name, role) in s.Roles)
            if (!secrets.Has(role.UserKey)) errors.Add($"roles.{name}: no credentials for userKey '{role.UserKey}' (tutorial.secrets.json or TUTORIAL_{role.UserKey.ToUpperInvariant()}_EMAIL/_PASSWORD)");
        if (s.Steps.Count == 0) errors.Add("steps: at least one step is required");
        var shots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < s.Steps.Count; i++)
        {
            var st = s.Steps[i];
            var at = $"steps[{i + 1}] ({st.Action})";
            if (!Actions.Contains(st.Action)) errors.Add($"{at}: unknown action");
            if (NeedsTarget.Contains(st.Action) && string.IsNullOrWhiteSpace(st.Target)) errors.Add($"{at}: target is required");
            if (st.Action == "navigate" && string.IsNullOrWhiteSpace(st.Url)) errors.Add($"{at}: url is required");
            if (st.Action is "fill" or "select" && st.Value is null) errors.Add($"{at}: value is required");
            if (st.Action == "upload" && (st.Files is null || st.Files.Count == 0)) errors.Add($"{at}: files is required");
            if (st.Action == "press" && string.IsNullOrWhiteSpace(st.Key)) errors.Add($"{at}: key is required");
            if (st.Role is not null && !s.Roles.ContainsKey(st.Role)) errors.Add($"{at}: role '{st.Role}' is not in roles");
            if (st.Action == "title" && string.IsNullOrWhiteSpace(st.Caption)) errors.Add($"{at}: title needs a caption (the card's title)");
            if (st.Action == "login" && st.Role is null) errors.Add($"{at}: login needs a role");
            if (st.Highlight is not null && !Highlights.Contains(st.Highlight)) errors.Add($"{at}: highlight '{st.Highlight}' is not box, arrow, spotlight or none");
            if (st.Placement is not null && !Placements.Contains(st.Placement)) errors.Add($"{at}: placement '{st.Placement}' is not auto, top, bottom, left or right");
            if (st.Zoom is < 1 or > 3) errors.Add($"{at}: zoom must be between 1 and 3");
            // a picture is written where shot: says, so it stays a plain name inside the scenario's screen/ folder
            if (st.Shot is not null && !ShotName().IsMatch(st.Shot)) errors.Add($"{at}: shot '{st.Shot}' is screen/<name>.jpg or .png");
            else if (st.Shot is not null && !shots.Add(st.Shot)) errors.Add($"{at}: shot {st.Shot} is named by two steps");
            if (st.ShotAt is not null && st.ShotAt is not ("before" or "after")) errors.Add($"{at}: shotAt '{st.ShotAt}' is before or after");
            foreach (Match m in SecretRef().Matches(st.Value ?? ""))
                if (secrets.Get(m.Groups[1].Value, m.Groups[2].Value) is null) errors.Add($"{at}: no secret {m.Value}");
        }
        if (errors.Count > 0) throw new InvalidDataException("the scenario has errors:\n  " + string.Join("\n  ", errors));
    }

    /// <summary>"${users.NewUser.password}" in a value reads the secrets file, so no password is written in a scenario.</summary>
    static string? Expand(string? value, Secrets secrets) =>
        value is null ? null : SecretRef().Replace(value, m => secrets.Get(m.Groups[1].Value, m.Groups[2].Value)!);

    [GeneratedRegex(@"\$\{users\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}")]
    private static partial Regex SecretRef();

    [GeneratedRegex("^[a-z0-9][a-z0-9-]*$")]
    private static partial Regex ClipName();

    [GeneratedRegex(@"^screen/[A-Za-z0-9][A-Za-z0-9._-]*\.(jpe?g|png)$", RegexOptions.IgnoreCase)]
    private static partial Regex ShotName();
}
