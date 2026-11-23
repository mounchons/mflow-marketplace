using System.Text.Json;
using Microsoft.Playwright;
using TutorialRecorder;
using TutorialRecorder.Actions;
using TutorialRecorder.Overlay;
using TutorialRecorder.Scenario;
using TutorialRecorder.Writing;

// dotnet run -- <scenario.yaml> [--mode caption|callout|both] [--headed] [--no-shots] [--durations file.json] [--secrets file.json]
// dotnet run -- <scenario.yaml> --shots [--only screen/a.jpg,screen/b.jpg]   the lesson's reference pictures, no video
const string usage = "usage: dotnet run -- <scenario.yaml> [--mode caption|callout|both|clean] [--voice] [--speed 0.85] [--lexicon <words.txt> ...] [--speaker \"<engine> <voice> <model>\"] [--style \"Friendly\"] [--check] [--headed] [--no-shots] [--no-setup] [--keep-webm] [--durations <file.json>] [--secrets <file.json>]\n"
    + "       dotnet run -- <scenario.yaml> --shots [--only <screen/x.jpg,...>] [--headed] [--no-setup] [--secrets <file.json>]";
if (args.Length == 0 || args[0] is "-h" or "--help") { Console.WriteLine(usage); return 1; }

string? Opt(string name) { var i = Array.IndexOf(args, name); return i >= 0 && i + 1 < args.Length ? args[i + 1] : null; }
bool Flag(string name) => args.Contains(name);

var toolDir = FindToolDir();
var scenarioPath = FindUp(args[0]) ?? throw new FileNotFoundException($"scenario not found: {args[0]}");
var settings = Settings.Load(Path.Combine(toolDir, "tutorial.settings.json"));
var secrets = Secrets.Load(Opt("--secrets") ?? Path.Combine(toolDir, "tutorial.secrets.json"));

ScenarioFile scenario;
try { scenario = ScenarioLoader.Load(scenarioPath, secrets); }
catch (InvalidDataException e) { Console.Error.WriteLine(e.Message); return 2; }
// A mode other than the scenario's own gets its own files (my-clip-callout.mp4), so the two do not overwrite.
var outName = scenario.Clip;
if (Opt("--mode") is { } mode && mode != scenario.Mode)
{
    if (mode is not ("caption" or "callout" or "both" or "clean")) { Console.Error.WriteLine($"--mode '{mode}' is not caption, callout, both or clean"); return 2; }
    scenario.Mode = mode;
    outName = $"{scenario.Clip}-{mode}";
}

var outRoot = Path.Combine(toolDir, "Output");
Directory.CreateDirectory(outRoot);
// The narration, one line per step that has one (the TTS input), and which step each line belongs to.
var narrated = scenario.Steps.Select((st, i) => (Step: i + 1, Text: st.Narration?.Trim())).Where(x => !string.IsNullOrEmpty(x.Text)).ToList();
var narrationTxt = Path.Combine(outRoot, scenario.Clip + ".narration.txt");
await File.WriteAllLinesAsync(narrationTxt, narrated.Select(x => x.Text!.ReplaceLineEndings(" ")));
await File.WriteAllTextAsync(Path.Combine(outRoot, scenario.Clip + ".narration.json"),
    JsonSerializer.Serialize(narrated.Select(x => new { scenarioStep = x.Step, text = x.Text }), TimingLog.Json));

if (Flag("--check"))
{
    Console.WriteLine($"ok: {scenario.Clip}, {scenario.Steps.Count} steps, mode {scenario.Mode}");
    foreach (var (st, i) in scenario.Steps.Select((st, i) => (st, i + 1)))
        Console.WriteLine($"  {i,2}. {st.Action,-9} {st.Role,-8} {st.Caption ?? st.Callout ?? st.Target ?? st.Url}");
    return 0;
}

// --shots: the pictures the steps' shot: name, and with --only just those (a run of one lesson step).
var shots = Flag("--shots");
HashSet<string>? only = null;
if (shots)
{
    if (!scenario.Steps.Any(s => s.Shot is not null)) { Console.Error.WriteLine("--shots: no step has a shot: (screen/<name>.jpg)"); return 2; }
    if (Opt("--only") is { } o)
    {
        only = o.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var unknown = only.Where(n => !scenario.Steps.Any(s => string.Equals(s.Shot, n, StringComparison.OrdinalIgnoreCase))).ToList();
        if (unknown.Count > 0) { Console.Error.WriteLine($"--only: no step's shot: is {string.Join(", ", unknown)}"); return 2; }
    }
}

// The TTS round: {"3": 4200, ...} sets step 3's reading time to the audio's length.
var holds = Opt("--durations") is { } dpath
    ? JsonSerializer.Deserialize<Dictionary<string, int>>(File.ReadAllText(dpath))!.ToDictionary(kv => int.Parse(kv.Key), kv => kv.Value)
    : new Dictionary<int, int>();

// --voice: speak each step's narration (PyThaiTTS, tools/TutorialRecorder/tts), hold every step as long as its audio,
// and mix the audio into the mp4 where the step's caption appears. The voice is made again when the narration changed.
List<Voice.Line>? voice = null;
if (Flag("--voice") && !shots)
{
    var speed = Opt("--speed") ?? "0.85";
    // --speaker "gemini Kore gemini-3.8-flash-tts" or "elevenlabs <voice_id> eleven_v3": an API voice (the plan's เสียงพากย์);
    // its key comes from the environment or tts/keys.json. Without it: Paradee on this machine.
    var speaker = Opt("--speaker") ?? "paradee";
    // --style "Friendly": how a Gemini voice delivers every line (the plan's สไตล์เสียง); other voices ignore it
    var style = Opt("--style") ?? "";
    // --lexicon <file>, any number (later wins): how words are said, e.g. the plugin's lexicon.txt, then clips/lexicon.txt
    var lexicons = args.Select((a, i) => (a, i)).Where(x => x.a == "--lexicon" && x.i + 1 < args.Length).Select(x => args[x.i + 1]).ToList();
    foreach (var f in lexicons.Where(f => !File.Exists(f))) Console.WriteLine($"  warning: --lexicon {f} not found");
    try { voice = Voice.Prepare(toolDir, outRoot, scenario.Clip, narrationTxt, narrated.Select(x => (x.Step, x.Text!)).ToList(), speed, lexicons.Where(File.Exists).ToList(), speaker, style); }
    catch (Exception e) when (e is InvalidOperationException or FileNotFoundException or ArgumentException) { Console.Error.WriteLine(e.Message); return 2; }
    foreach (var v in voice) holds[v.ScenarioStep] = v.DurationMs + settings.VoiceTailMs;
    Console.WriteLine($"voice: {voice.Count} lines, {voice.Sum(v => v.DurationMs) / 1000.0:0.0}s of speech");
}

if (scenario.Setup is { } setup && !Flag("--no-setup"))
{
    Console.WriteLine($"setup: {setup}");
    var psi = new System.Diagnostics.ProcessStartInfo(OperatingSystem.IsWindows() ? "pwsh" : "sh") { WorkingDirectory = scenario.SourceDir, UseShellExecute = false };
    foreach (var a in OperatingSystem.IsWindows() ? new[] { "-NoProfile", "-Command", setup } : new[] { "-c", setup }) psi.ArgumentList.Add(a);
    using var proc = System.Diagnostics.Process.Start(psi)!;
    proc.WaitForExit();
    if (proc.ExitCode != 0) { Console.Error.WriteLine($"setup failed ({proc.ExitCode})"); return 2; }
}

if (shots) return await TakeShots();

var clipDir = Path.Combine(outRoot, outName);
var rawDir = Path.Combine(clipDir, "raw");
var shotsDir = Path.Combine(clipDir, "steps");
if (Directory.Exists(clipDir)) Directory.Delete(clipDir, recursive: true);
foreach (var old in new[] { ".mp4", ".failed.mp4", ".srt", ".timing.json" }) File.Delete(Path.Combine(outRoot, outName + old));
Directory.CreateDirectory(rawDir);
var takeShots = !Flag("--no-shots") && scenario.Mode is "callout" or "both";

Console.WriteLine($"clip {scenario.Clip}: {scenario.Steps.Count} steps, mode {scenario.Mode}, {scenario.BaseUrl}");
var overlayJs = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Overlay", "overlay.js"));

using var playwright = await Playwright.CreateAsync();
await using var browser = await playwright.Chromium.LaunchAsync(new() { Headless = !Flag("--headed") });
var context = await browser.NewContextAsync(new()
{
    ViewportSize = new() { Width = settings.ViewportWidth, Height = settings.ViewportHeight },
    DeviceScaleFactor = settings.DeviceScaleFactor,
    RecordVideoDir = rawDir,
    RecordVideoSize = new() { Width = settings.ViewportWidth, Height = settings.ViewportHeight },
    Locale = "th-TH",
    TimezoneId = "Asia/Bangkok",
});
await context.AddInitScriptAsync(overlayJs);

var log = new TimingLog { Clip = scenario.Clip, Title = scenario.Title, Mode = scenario.Mode, Width = settings.ViewportWidth, Height = settings.ViewportHeight };
var page = await context.NewPageAsync();
log.Restart(); // the video starts with the page
var runner = new StepRunner(page, context, scenario, settings, secrets, new OverlayClient(page, overlayJs), log, shotsDir, takeShots, holds);

var failed = false;
try { await runner.RunAll(); }
catch (TargetNotFoundException e)
{
    Console.Error.WriteLine($"STOPPED: {e.Message}");
    failed = true;
}
var rawEnd = log.Now();
await page.WaitForTimeoutAsync(500);
await context.CloseAsync();
var webm = await page.Video!.PathAsync();

// Cut the blank page before the first screen loaded (the first step's caption then starts near 0).
log.Trim(Math.Max(0, (log.FirstContentMs ?? 0) - settings.LeadInMs), rawEnd + 500);

var baseName = Path.Combine(outRoot, outName);
await File.WriteAllTextAsync(baseName + ".timing.json", log.ToJson());
await File.WriteAllTextAsync(baseName + ".srt", Writers.Srt(log));
var mp4 = baseName + (failed ? ".failed.mp4" : ".mp4");
Writers.ToMp4(webm, mp4, log.TrimMs, settings.Crf);
if (voice is not null)
{
    foreach (var w in Voice.Mix(mp4, voice, log)) Console.WriteLine($"  warning: {w}");
    await File.WriteAllTextAsync(baseName + ".timing.json", log.ToJson()); // now with each step's audio
}
await File.WriteAllTextAsync(Path.Combine(clipDir, "review.html"), Writers.Review(log, "../" + Path.GetFileName(mp4)));
if (takeShots) await File.WriteAllTextAsync(Path.Combine(clipDir, "manual.md"), Writers.Manual(log));
if (!Flag("--keep-webm")) Directory.Delete(rawDir, recursive: true);

Console.WriteLine($"{(failed ? "partial" : "done")}: {mp4} ({log.DurationMs / 1000.0:0.0}s, {log.Steps.Count} steps)");
Console.WriteLine($"  {baseName}.srt, {baseName}.timing.json, {Path.Combine(clipDir, "review.html")}");
return failed ? 3 : 0;

// --shots: the steps as fast as the page allows (no reading time, no cursor travel, no typing), no video, one picture
// per shot: at 1920×1080 (scale 1, so a version's copies stay small). The output folder of the last recording is left
// alone; a step that fails leaves its screenshot in Output/<clip>-shots/.
async Task<int> TakeShots()
{
    scenario.Mode = "clean";
    settings.CaptionMinMs = settings.CaptionMsPerChar = settings.CalloutMinMs = settings.CalloutMsPerChar = 0;
    settings.CursorMoveMs = settings.TypeDelayMs = settings.GapMs = settings.ZoomMs = 0;
    var js = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Overlay", "overlay.js"));
    var failedDir = Path.Combine(outRoot, scenario.Clip + "-shots");
    if (Directory.Exists(failedDir)) Directory.Delete(failedDir, recursive: true);
    Console.WriteLine($"shots {scenario.Clip}: {(only is null ? "every shot:" : string.Join(", ", only))}, {scenario.BaseUrl}");

    using var pw = await Playwright.CreateAsync();
    await using var b = await pw.Chromium.LaunchAsync(new() { Headless = !Flag("--headed") });
    var ctx = await b.NewContextAsync(new()
    {
        ViewportSize = new() { Width = settings.ViewportWidth, Height = settings.ViewportHeight },
        DeviceScaleFactor = 1,
        Locale = "th-TH",
        TimezoneId = "Asia/Bangkok",
    });
    await ctx.AddInitScriptAsync(js);
    var pg = await ctx.NewPageAsync();
    var shotLog = new TimingLog { Clip = scenario.Clip, Title = scenario.Title, Mode = scenario.Mode, Width = settings.ViewportWidth, Height = settings.ViewportHeight };
    shotLog.Restart();
    var refs = new ReferenceShots(scenario.SourceDir, only);
    var run = new StepRunner(pg, ctx, scenario, settings, secrets, new OverlayClient(pg, js), shotLog, failedDir, false, new Dictionary<int, int>(), refs);
    TargetNotFoundException? stop = null;
    try { await run.RunAll(); }
    catch (TargetNotFoundException e) { stop = e; Console.Error.WriteLine($"STOPPED: {e.Message}"); }
    await ctx.CloseAsync();
    refs.Save(stop);

    foreach (var n in refs.Written) Console.WriteLine($"  wrote {n}");
    foreach (var n in refs.KeptOwn) Console.WriteLine($"  kept {n} (not made by the recorder: the user's own; --only {n} replaces it)");
    var wanted = scenario.Steps.Select(s => s.Shot).OfType<string>().Where(n => only is null || only.Contains(n));
    var notTaken = wanted.Where(n => !refs.Written.Contains(n) && !refs.KeptOwn.Contains(n)).ToList();
    if (notTaken.Count > 0) Console.WriteLine($"  not taken: {string.Join(", ", notTaken)}");
    Console.WriteLine($"{(stop is null ? "done" : "partial")}: {refs.Written.Count} pictures in {Path.Combine(scenario.SourceDir, "screen")}, {Path.Combine(scenario.SourceDir, "shots.json")}");
    return stop is null ? 0 : 3;
}

// The tool's source folder (where the csproj, settings and secrets are), found up from the build output.
static string FindToolDir()
{
    for (var d = new DirectoryInfo(AppContext.BaseDirectory); d is not null; d = d.Parent)
        if (File.Exists(Path.Combine(d.FullName, "TutorialRecorder.csproj"))) return d.FullName;
    return Directory.GetCurrentDirectory();
}

// A relative path is tried from the current folder and then each folder above it, so
// `dotnet run -- scenarios/x.yaml` works from the repository root and from tools/TutorialRecorder alike.
static string? FindUp(string path)
{
    if (Path.IsPathRooted(path)) return File.Exists(path) ? path : null;
    for (var d = new DirectoryInfo(Directory.GetCurrentDirectory()); d is not null; d = d.Parent)
    {
        var p = Path.Combine(d.FullName, path);
        if (File.Exists(p)) return p;
    }
    return null;
}
