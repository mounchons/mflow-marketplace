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
    /// <summary>
    /// The title cards' look, from the app's theme (the record skill fills it from the app's CSS). Every field is
    /// optional: without a primary colour the recorder reads the colours the page shows, once per run, then falls back
    /// to its own blue.
    /// </summary>
    public CardTheme Card { get; set; } = new();

    public static Settings Load(string path)
    {
        if (!File.Exists(path)) return new Settings();
        var s = JsonSerializer.Deserialize<Settings>(File.ReadAllText(path), new JsonSerializerOptions { PropertyNameCaseInsensitive = true, ReadCommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true }) ?? new Settings();
        s.Card ??= new CardTheme();
        s.Card.Logo = CardTheme.LogoSource(s.Card.Logo, Path.GetDirectoryName(Path.GetFullPath(path))!);
        return s;
    }

    public int CaptionHold(string? text) => Math.Max(CaptionMinMs, (text?.Length ?? 0) * CaptionMsPerChar);
    public int CalloutHold(string? text) => Math.Max(CalloutMinMs, (text?.Length ?? 0) * CalloutMsPerChar);
}

/// <summary>A title card's theme: <c>"card": { "primary": "#34aa55", "dark": "#005926", "font": "Sarabun", "name": "ComparePrice" }</c>.</summary>
public sealed class CardTheme
{
    /// <summary>The app's main colour, the card's background (made darker when white text would not read on it).</summary>
    public string? Primary { get; set; }
    /// <summary>The far end of the background's gradient; a darker shade of the primary when missing.</summary>
    public string? Dark { get; set; }
    /// <summary>The bar and the summary's numbers; white (or the text's colour) when missing.</summary>
    public string? Accent { get; set; }
    /// <summary>The app's font family; Thai fonts follow it for the letters it lacks.</summary>
    public string? Font { get; set; }
    /// <summary>An image file beside this settings file (png, jpg, svg, webp; under 2 MB) or a path of the app (/img/logo.png).</summary>
    public string? Logo { get; set; }
    /// <summary>The app's name, shown with the logo at the card's top.</summary>
    public string? Name { get; set; }

    /// <summary>A logo file becomes a data URI (the page cannot read the disk); an app path stays; anything else is dropped.</summary>
    public static string? LogoSource(string? logo, string baseDir)
    {
        if (string.IsNullOrWhiteSpace(logo)) return null;
        if (logo.StartsWith("data:image/", StringComparison.Ordinal)) return logo;
        if (logo.StartsWith('/') && !logo.StartsWith("//", StringComparison.Ordinal) && !File.Exists(logo)) return logo;
        var file = Path.IsPathRooted(logo) ? logo : Path.Combine(baseDir, logo);
        var mime = Path.GetExtension(file).ToLowerInvariant() switch
        {
            ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", ".svg" => "image/svg+xml", ".webp" => "image/webp", _ => null,
        };
        if (mime is null || !File.Exists(file) || new FileInfo(file).Length > 2_000_000)
        {
            Console.WriteLine($"  warning: card logo {logo} is not a png, jpg, svg or webp file under 2 MB; the cards have none");
            return null;
        }
        return $"data:{mime};base64,{Convert.ToBase64String(File.ReadAllBytes(file))}";
    }
}
