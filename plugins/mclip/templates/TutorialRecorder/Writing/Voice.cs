using System.Diagnostics;
using System.Globalization;
using System.Text.Json;

namespace TutorialRecorder.Writing;

/// <summary>
/// The voice-over: each step's narration spoken by PyThaiTTS (tts/tts_paradee.py, voice MakHam Paradee) into
/// Output/&lt;clip&gt;-voice/NNN.wav, then mixed into the mp4 where the step's caption appears.
/// </summary>
public static class Voice
{
    public sealed record Line(int ScenarioStep, string Text, string File, int DurationMs);

    sealed record Manifest(string Voice, double Speed, int SampleRate, List<Item> Items);
    sealed record Item(int N, int Line, string Text, string File, int DurationMs);

    static readonly JsonSerializerOptions Read = new() { PropertyNameCaseInsensitive = true };

    /// <summary>
    /// Returns the audio of every narrated step, speaking it again when the narration, the speed, the pronunciation rules
    /// (<paramref name="lexicons"/>: files of `written = spoken` lines, later wins) or the voice script changed.
    /// </summary>
    public static List<Line> Prepare(string toolDir, string outRoot, string clip, string narrationTxt, List<(int Step, string Text)> narrated, string speed, IReadOnlyList<string>? lexicons = null)
    {
        if (narrated.Count == 0) throw new InvalidOperationException("--voice: no step has a narration");
        lexicons ??= [];
        var dir = Path.Combine(outRoot, clip + "-voice");
        var manifestPath = Path.Combine(dir, "manifest.json");
        var manifest = Load(manifestPath);
        var wanted = double.Parse(speed, CultureInfo.InvariantCulture);
        // what the audio was made from besides the words: the rules' text and the script, so a new word is heard
        var inputsPath = Path.Combine(dir, "inputs.txt");
        var inputs = Inputs(toolDir, lexicons);
        var sameInputs = File.Exists(inputsPath) && File.ReadAllText(inputsPath) == inputs;
        if (manifest is null || !sameInputs || Math.Abs(manifest.Speed - wanted) > 0.001 || !manifest.Items.Select(i => i.Text).SequenceEqual(narrated.Select(n => n.Text.Trim())))
        {
            Console.WriteLine($"voice: speaking {narrated.Count} lines (PyThaiTTS makham_paradee, speed {speed}{(lexicons.Count > 0 ? $", rules {string.Join(", ", lexicons.Select(Path.GetFileName))}" : "")})");
            Speak(toolDir, narrationTxt, dir, speed, lexicons);
            manifest = Load(manifestPath) ?? throw new InvalidOperationException($"--voice: {manifestPath} was not written");
            File.WriteAllText(inputsPath, inputs);
        }
        if (manifest.Items.Count != narrated.Count) throw new InvalidOperationException("--voice: the voice does not match the narration; delete " + dir);
        return narrated.Zip(manifest.Items, (n, i) => new Line(n.Step, n.Text, Path.Combine(dir, i.File), i.DurationMs)).ToList();
    }

    static Manifest? Load(string path) => File.Exists(path) ? JsonSerializer.Deserialize<Manifest>(File.ReadAllText(path), Read) : null;

    static string Inputs(string toolDir, IReadOnlyList<string> lexicons)
    {
        var script = Path.Combine(toolDir, "tts", "tts_paradee.py");
        var parts = new List<string> { "script:" + Hash(File.Exists(script) ? File.ReadAllText(script) : "") };
        foreach (var f in lexicons) parts.Add($"{Path.GetFullPath(f)}:{Hash(File.Exists(f) ? File.ReadAllText(f) : "")}");
        return string.Join("\n", parts);
    }

    static string Hash(string text) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(text)))[..16];

    static void Speak(string toolDir, string input, string outDir, string speed, IReadOnlyList<string> lexicons)
    {
        var ttsDir = Path.Combine(toolDir, "tts");
        var python = OperatingSystem.IsWindows() ? Path.Combine(ttsDir, ".venv", "Scripts", "python.exe") : Path.Combine(ttsDir, ".venv", "bin", "python");
        if (!File.Exists(python))
            throw new FileNotFoundException($"--voice needs the TTS venv: py -3.13 -m venv {Path.Combine(ttsDir, ".venv")} and then pip install pythaitts==1.0.0 soundfile (see README)");
        var psi = new ProcessStartInfo(python) { UseShellExecute = false };
        psi.Environment["PYTHONIOENCODING"] = "utf-8";
        foreach (var a in new[] { Path.Combine(ttsDir, "tts_paradee.py"), "--input", input, "--out", outDir, "--speed", speed }) psi.ArgumentList.Add(a);
        foreach (var f in lexicons) { psi.ArgumentList.Add("--lexicon"); psi.ArgumentList.Add(Path.GetFullPath(f)); }
        using var p = Process.Start(psi)!;
        p.WaitForExit();
        if (p.ExitCode != 0) throw new InvalidOperationException($"--voice: tts_paradee.py failed ({p.ExitCode})");
    }

    /// <summary>Lays each sentence at its step's caption, writes the times into the log, returns warnings.</summary>
    public static List<string> Mix(string mp4, List<Line> lines, TimingLog log)
    {
        var warnings = new List<string>();
        var placed = new List<(Line Line, long Start)>();
        foreach (var l in lines)
        {
            var step = log.Steps.FirstOrDefault(s => s.ScenarioStep == l.ScenarioStep);
            if (step is null) { warnings.Add($"step {l.ScenarioStep} did not run; its sentence is left out"); continue; }
            var start = Math.Max(0, step.CaptionSpan?.StartMs ?? step.CalloutSpan?.StartMs ?? step.StartMs);
            step.Audio = new Span { Text = Path.GetFileName(l.File), StartMs = start, EndMs = start + l.DurationMs };
            if (step.Audio.EndMs > step.EndMs + 300)
                warnings.Add($"step {l.ScenarioStep}'s sentence runs {(step.Audio.EndMs - step.EndMs) / 1000.0:0.0}s past the step");
            placed.Add((l, start));
        }
        for (var i = 1; i < placed.Count; i++)
        {
            var prevEnd = placed[i - 1].Start + placed[i - 1].Line.DurationMs;
            if (prevEnd > placed[i].Start)
                warnings.Add($"step {placed[i - 1].Line.ScenarioStep}'s sentence overlaps step {placed[i].Line.ScenarioStep}'s by {(prevEnd - placed[i].Start) / 1000.0:0.0}s");
        }
        if (placed.Count == 0) return warnings;

        var tmp = mp4 + ".voice.mp4";
        var args = new List<string> { "-y", "-hide_banner", "-loglevel", "error", "-i", mp4 };
        foreach (var (l, _) in placed) { args.Add("-i"); args.Add(l.File); }
        var graph = string.Join(";", placed.Select((p, i) => $"[{i + 1}:a]adelay={p.Start}:all=1[a{i}]"))
            + ";" + string.Concat(placed.Select((_, i) => $"[a{i}]")) + $"amix=inputs={placed.Count}:normalize=0:duration=longest[voice]";
        args.AddRange(["-filter_complex", graph, "-map", "0:v", "-map", "[voice]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", tmp]);
        var psi = new ProcessStartInfo("ffmpeg") { RedirectStandardError = true, UseShellExecute = false };
        foreach (var a in args) psi.ArgumentList.Add(a);
        using var p = Process.Start(psi)!;
        var err = p.StandardError.ReadToEnd();
        p.WaitForExit();
        if (p.ExitCode != 0) throw new InvalidOperationException($"ffmpeg (voice mix) failed ({p.ExitCode}): {err}");
        File.Move(tmp, mp4, overwrite: true);
        return warnings;
    }
}
