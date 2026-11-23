using Microsoft.Playwright;

namespace TutorialRecorder.Overlay;

public readonly record struct Box(double X, double Y, double Width, double Height)
{
    public double CenterX => X + Width / 2;
    public double CenterY => Y + Height / 2;
}

/// <summary>Calls window.__tour (overlay.js). Each call re-injects the script first in case the page replaced itself.</summary>
public sealed class OverlayClient(IPage page, string script)
{
    async Task Ensure()
    {
        if (!await page.EvaluateAsync<bool>("() => !!window.__tour")) await page.EvaluateAsync(script);
    }

    public async Task ZoomTo(Box? rect, double scale, int ms)
    {
        await Ensure();
        await page.EvaluateAsync("([r, s, ms]) => window.__tour.zoomTo(r, s, ms)", new object?[] { Rect(rect), scale, ms });
    }

    public async Task<double> ZoomScale()
    {
        await Ensure();
        return await page.EvaluateAsync<double>("() => window.__tour.zoomState().s");
    }

    public async Task MoveCursor(double x, double y, int ms)
    {
        await Ensure();
        await page.EvaluateAsync("([x, y, ms]) => window.__tour.moveCursor(x, y, ms)", new object[] { x, y, ms });
    }

    public async Task HideCursor()
    {
        await Ensure();
        await page.EvaluateAsync("() => window.__tour.hideCursor()");
    }

    public async Task Ripple(double x, double y)
    {
        await Ensure();
        await page.EvaluateAsync("([x, y]) => window.__tour.ripple(x, y)", new object[] { x, y });
    }

    public async Task Highlight(string kind, Box rect, string? badge = null, bool ok = false)
    {
        await Ensure();
        await page.EvaluateAsync("([k, r, o]) => window.__tour.highlight(k, r, o)", new object?[] { kind, Rect(rect), new { badge, ok } });
    }

    public async Task Card(string title, string? subtitle, CardTheme? theme = null, string? label = null)
    {
        await Ensure();
        var th = theme is null ? null : new { primary = theme.Primary, dark = theme.Dark, accent = theme.Accent, font = theme.Font, logo = theme.Logo, name = theme.Name };
        await page.EvaluateAsync("([t, s, th, l]) => window.__tour.card(t, s, th, l)", new object?[] { title, subtitle, th, label });
    }

    /// <summary>The colours and font the page shows (its background gradient, a primary button), for the cards' theme.</summary>
    public async Task<CardTheme> PageTheme()
    {
        await Ensure();
        var json = await page.EvaluateAsync<string>("() => JSON.stringify(window.__tour.pageTheme())");
        return System.Text.Json.JsonSerializer.Deserialize<CardTheme>(json, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new CardTheme();
    }

    public async Task Caption(string? text)
    {
        if (string.IsNullOrEmpty(text)) return;
        await Ensure();
        await page.EvaluateAsync("(t) => window.__tour.caption(t)", text);
    }

    public async Task Callout(string text, Box? rect, string? placement, string? number, bool ok, int reserveBottom)
    {
        await Ensure();
        await page.EvaluateAsync("([t, r, p, o]) => window.__tour.callout(t, r, p, o)",
            new object?[] { text, Rect(rect), placement ?? "auto", new { number, ok, reserveBottom } });
    }

    /// <summary>Removes the step's boxes, arrows and spotlights, keeping its caption and callout.</summary>
    public async Task ClearMarks()
    {
        try { await Ensure(); await page.EvaluateAsync("() => window.__tour.clearMarks()"); }
        catch (PlaywrightException) { /* the page navigated away: nothing left to clear */ }
    }

    public async Task ClearStep()
    {
        try { await Ensure(); await page.EvaluateAsync("() => window.__tour.clearStep()"); }
        catch (PlaywrightException) { /* the page navigated away: nothing left to clear */ }
    }

    static object? Rect(Box? b) => b is { } r ? new { x = r.X, y = r.Y, width = r.Width, height = r.Height } : null;
}
