using System.Text.Json;

namespace TutorialRecorder;

/// <summary>Timing and capture settings (tutorial.settings.json beside the tool). Every value has a default.</summary>
public sealed class Settings
{
    public int ViewportWidth { get; set; } = 1920;
    public int ViewportHeight { get; set; } = 1080;
    public float DeviceScaleFactor { get; set; } = 2;
    /// <summary>Reading time in caption mode: max(CaptionMinMs, characters × CaptionMsPerChar).</summary>
    public int CaptionMinMs { get; set; } = 1500;
    public int CaptionMsPerChar { get; set; } = 80;
    /// <summary>Reading time in callout mode (no voice to help): max(CalloutMinMs, characters × CalloutMsPerChar).</summary>
    public int CalloutMinMs { get; set; } = 2000;
    public int CalloutMsPerChar { get; set; } = 90;
    public int ZoomMs { get; set; } = 600;
    public int CursorMoveMs { get; set; } = 700;
    public int TypeDelayMs { get; set; } = 70;
    /// <summary>How long to look for a target before the run stops with a screenshot.</summary>
    public int FindTimeoutMs { get; set; } = 10000;
    /// <summary>The most to wait for the network to settle after an action (a page that polls never settles).</summary>
    public int SettleTimeoutMs { get; set; } = 1500;
    /// <summary>A short pause between steps so cuts do not feel abrupt.</summary>
    public int GapMs { get; set; } = 300;
    /// <summary>Video kept before the first step starts (the blank page before it is trimmed).</summary>
    public int LeadInMs { get; set; } = 300;
    public int Crf { get; set; } = 18;
    /// <summary>With --voice: a step holds its audio's length plus this, so the action follows the sentence.</summary>
    public int VoiceTailMs { get; set; } = 300;

    public static Settings Load(string path)
    {
        if (!File.Exists(path)) return new Settings();
        return JsonSerializer.Deserialize<Settings>(File.ReadAllText(path), new JsonSerializerOptions { PropertyNameCaseInsensitive = true, ReadCommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true }) ?? new Settings();
    }

    public int CaptionHold(string? text) => Math.Max(CaptionMinMs, (text?.Length ?? 0) * CaptionMsPerChar);
    public int CalloutHold(string? text) => Math.Max(CalloutMinMs, (text?.Length ?? 0) * CalloutMsPerChar);
}
