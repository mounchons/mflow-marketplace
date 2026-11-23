using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Playwright;
using TutorialRecorder.Scenario;

namespace TutorialRecorder.Actions;

/// <summary>
/// --shots: a lesson's reference pictures. Each scenario step with <c>shot: screen/NN-x.jpg</c> writes that picture into
/// the scenario's folder (clips/&lt;id&gt;/screen/), and shots.json beside the scenario records which pictures the
/// recorder made. A picture already there that the recorder did not make is the user's own: kept, unless
/// <paramref name="only"/> names it.
/// </summary>
public sealed class ReferenceShots(string sourceDir, IReadOnlySet<string>? only)
{
    readonly HashSet<string> done = new(StringComparer.OrdinalIgnoreCase);
    readonly JsonObject made = LoadMade(Path.Combine(sourceDir, "shots.json"));
    public List<string> Written { get; } = [];
    public List<string> KeptOwn { get; } = [];

    string ManifestPath => Path.Combine(sourceDir, "shots.json");

    /// <summary>Every picture asked for is written (or kept): the run can stop.</summary>
    public bool Finished => only is not null && only.All(done.Contains);

    public bool Wants(Step step, string when) =>
        step.Shot is { } s && !done.Contains(s) && (only is null || only.Contains(s)) && (step.ShotAt ?? "before") == when;

    /// <summary>A step whose picture was not taken at its moment (an action with no target to mark): take it now.</summary>
    public bool Missed(Step step) => step.Shot is { } s && !done.Contains(s) && (only is null || only.Contains(s));

    public async Task Take(IPage page, Step step, int index)
    {
        var name = step.Shot!;
        done.Add(name);
        var file = Path.Combine(sourceDir, name.Replace('/', Path.DirectorySeparatorChar));
        if (File.Exists(file) && !made.ContainsKey(name) && only is null)
        {
            KeptOwn.Add(name);
            return;
        }
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        await page.WaitForTimeoutAsync(320); // let the highlight's pop-in (≤ 260 ms) finish
        var jpeg = !name.EndsWith(".png", StringComparison.OrdinalIgnoreCase);
        await page.ScreenshotAsync(new() { Path = file, Type = jpeg ? ScreenshotType.Jpeg : ScreenshotType.Png, Quality = jpeg ? 82 : null });
        made[name] = new JsonObject { ["date"] = DateTime.UtcNow.ToString("o"), ["scenarioStep"] = index };
        Written.Add(name);
    }

    /// <summary>Writes shots.json: the pictures the recorder made, and the step the run stopped at (null when it did not).</summary>
    public void Save(TargetNotFoundException? failed)
    {
        var doc = new JsonObject
        {
            ["date"] = DateTime.UtcNow.ToString("o"),
            ["pictures"] = JsonNode.Parse(made.ToJsonString()),
            ["failed"] = failed is null ? null : new JsonObject { ["step"] = failed.Step, ["message"] = failed.Message.Split('\n', 2)[0].Trim() },
        };
        File.WriteAllText(ManifestPath, doc.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + "\n");
    }

    static JsonObject LoadMade(string path)
    {
        try { return JsonNode.Parse(File.ReadAllText(path))?["pictures"] is JsonObject o ? (JsonObject)JsonNode.Parse(o.ToJsonString())! : new(); }
        catch (Exception e) when (e is IOException or JsonException) { return new(); }
    }
}
