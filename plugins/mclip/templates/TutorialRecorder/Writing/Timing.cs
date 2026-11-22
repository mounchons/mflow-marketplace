using System.Diagnostics;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Unicode;
using TutorialRecorder.Overlay;

namespace TutorialRecorder.Writing;

/// <summary>A span of the video in ms from the start of the final mp4.</summary>
public sealed class Span
{
    public string Text { get; set; } = "";
    public long StartMs { get; set; }
    public long EndMs { get; set; }
}

/// <summary>A screenshot pair: Annotated has the overlay, Clean the same screen without it (both at device scale 2).</summary>
public sealed class Frame
{
    public string Kind { get; set; } = "step";   // step | result
    public string Annotated { get; set; } = "";
    public string Clean { get; set; } = "";
    /// <summary>The target in CSS px of the 1920×1080 viewport (the picture is 2× that), zoom included.</summary>
    public Box? Box { get; set; }
    public double Zoom { get; set; } = 1;
    public string? Text { get; set; }
}

public sealed class StepTiming
{
    /// <summary>The entry's number in the clip (1, 2, ...), auto entries included.</summary>
    public int Index { get; set; }
    /// <summary>The step's number in the scenario file; absent for an entry the recorder added (sign-in on a role change).</summary>
    public int? ScenarioStep { get; set; }
    public string Action { get; set; } = "";
    public string? Role { get; set; }
    public string? Target { get; set; }
    public string? Caption { get; set; }
    public string? Narration { get; set; }
    public long StartMs { get; set; }
    public long EndMs { get; set; }
    /// <summary>The reading time used; the TTS round replaces it with the audio's length (holdMs in the scenario).</summary>
    public int HoldMs { get; set; }
    public Span? CaptionSpan { get; set; }
    public Span? CalloutSpan { get; set; }
    public Span? ResultSpan { get; set; }
    /// <summary>The target's box on screen (CSS px of the 1920×1080 viewport, zoom included) when highlighted.</summary>
    public Box? Box { get; set; }
    public double Zoom { get; set; } = 1;
    public List<string> Screenshots { get; set; } = new();
    /// <summary>Each picture with its overlay-free twin and the box it points at (for a motion tool).</summary>
    public List<Frame> Frames { get; set; } = new();
    /// <summary>With --voice: the narration's audio file and where it starts in the mp4.</summary>
    public Span? Audio { get; set; }
    /// <summary>A step the recorder added itself (sign-in on a role change).</summary>
    public bool Auto { get; set; }
}

public sealed class TimingLog
{
    readonly Stopwatch clock = Stopwatch.StartNew();
    public string Clip { get; set; } = "";
    public string? Title { get; set; }
    public string Mode { get; set; } = "";
    public DateTimeOffset RecordedAt { get; set; } = DateTimeOffset.Now;
    public int Width { get; set; }
    public int Height { get; set; }
    /// <summary>ms cut from the start of the raw recording (the blank page before the first step).</summary>
    public long TrimMs { get; set; }
    public long DurationMs { get; set; }
    public List<StepTiming> Steps { get; set; } = new();

    /// <summary>When the first page had loaded (raw ms): the video before it is blank and is cut.</summary>
    [JsonIgnore] public long? FirstContentMs { get; set; }

    /// <summary>Raw time since the page (and so the video) started.</summary>
    public long Now() => clock.ElapsedMilliseconds;
    public void Restart() => clock.Restart();

    /// <summary>Moves every time from the raw recording to the trimmed mp4.</summary>
    public void Trim(long trimMs, long rawEndMs)
    {
        TrimMs = trimMs;
        for (var i = 0; i < Steps.Count; i++) Steps[i].Index = i + 1;
        DurationMs = rawEndMs - trimMs;
        foreach (var s in Steps)
        {
            s.StartMs = Math.Max(0, s.StartMs - trimMs); s.EndMs -= trimMs;
            foreach (var sp in new[] { s.CaptionSpan, s.CalloutSpan, s.ResultSpan })
                if (sp is not null) { sp.StartMs = Math.Max(0, sp.StartMs - trimMs); sp.EndMs -= trimMs; }
        }
    }

    public static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.All),
    };

    public string ToJson() => JsonSerializer.Serialize(this, Json);
}
