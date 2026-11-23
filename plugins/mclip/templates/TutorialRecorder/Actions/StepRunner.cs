using Microsoft.Playwright;
using TutorialRecorder.Overlay;
using TutorialRecorder.Scenario;
using TutorialRecorder.Writing;

namespace TutorialRecorder.Actions;

/// <summary>
/// Runs the steps on one page (one video). Per step: find the target, zoom, show the caption / callout and highlight,
/// move the cursor there, hold for reading, act, wait for the page to settle, show the result, clear, log the times.
/// </summary>
public sealed class StepRunner(IPage page, IBrowserContext context, ScenarioFile scenario, Settings cfg, Secrets secrets,
    OverlayClient overlay, TimingLog log, string shotsDir, bool takeShots, IReadOnlyDictionary<int, int> holdOverrides,
    ReferenceShots? refs = null)
{
    static readonly string[] Circled = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
    string? currentRole;
    int number; // the step badge, counted over steps that point at something
    int shot;

    bool Captions => scenario.Mode is "caption" or "both";
    bool Callouts => scenario.Mode is "callout" or "both";
    // clean: the screen, the cursor and the highlights only. Captions and title cards are timed and written to the .srt as
    // in caption mode, but not drawn, so an editor (WeftCut) can lay its own over the video.
    bool Clean => scenario.Mode == "clean";
    // The caption bar's height, kept free of callouts in "both".
    int ReserveBottom => Captions ? 150 : 0;

    public async Task RunAll()
    {
        for (var i = 0; i < scenario.Steps.Count; i++)
        {
            var step = scenario.Steps[i];
            if (step.Role is not null && step.Role != currentRole && step.Action != "login")
                await Login(step.Role, i + 1, auto: true);
            await Run(step, i + 1);
            if (refs is { Finished: true }) return; // --shots of one step: what comes after it is not needed
            await page.WaitForTimeoutAsync(cfg.GapMs);
        }
    }

    /// <summary>--shots: the step's reference picture, when it is taken at this moment.</summary>
    async Task Reference(Step step, int index, string when, bool pointing = false)
    {
        if (refs is null || !refs.Wants(step, when)) return;
        // the cursor belongs on the target about to be used; anywhere else it floats where the last step left it
        if (!pointing) await overlay.HideCursor();
        await refs.Take(page, step, index);
    }

    async Task Run(Step step, int index)
    {
        var t = new StepTiming { ScenarioStep = index, Action = step.Action, Role = step.Role ?? currentRole, Target = step.Target, Caption = step.Caption, Narration = step.Narration, StartMs = log.Now() };
        log.Steps.Add(t);
        switch (step.Action)
        {
            case "login": await Login(step.Role!, index, auto: false, t); break;
            case "logout": await Logout(); await Show(step, t, null); await Hold(step, t, index); break;
            case "navigate":
                await page.GotoAsync(Url(step.Url!));
                await Settle(step, index);
                await Show(step, t, null);
                await Hold(step, t, index);
                break;
            case "title":
            {
                // A full-screen card. Before any sign-in the page is blank: open the sign-in page behind the card.
                if (step.Url is not null || page.Url == "about:blank")
                {
                    await page.GotoAsync(Url(step.Url ?? (currentRole is null ? scenario.Login!.Url : "/")));
                    await Settle(step, index);
                }
                if (Clean) await overlay.HideCursor();
                else await overlay.Card(step.Caption!, step.Subtitle);
                t.CaptionSpan = new Span { Text = step.Subtitle is null ? step.Caption! : $"{step.Caption}: {step.Subtitle}", StartMs = log.Now() };
                await Hold(step, t, index, int.TryParse(step.Value, out var cardMs) ? cardMs : null);
                break;
            }
            case "wait":
                await Show(step, t, step.Target is null ? null : await Find(step, index));
                await Hold(step, t, index, int.TryParse(step.Value, out var ms) ? ms : null);
                break;
            case "zoom":
            {
                var box = await Find(step, index);
                await overlay.ZoomTo(box, step.Zoom ?? 1.8, cfg.ZoomMs);
                t.Zoom = step.Zoom ?? 1.8;
                if (step.Caption is not null || step.Callout is not null) { await Show(step, t, await Find(step, index)); await Hold(step, t, index); }
                break;
            }
            case "zoom-out":
                await overlay.ZoomTo(null, 1, cfg.ZoomMs);
                if (step.Caption is not null) { await Show(step, t, null); await Hold(step, t, index); }
                break;
            case "press" when step.Target is null:
                await Show(step, t, null);
                await Hold(step, t, index);
                await page.Keyboard.PressAsync(step.Key!);
                await Settle(step, index);
                break;
            default: await Act(step, t, index); break;
        }
        // a step with nothing to mark (login, a key press, zoom-out): its picture is the screen it ends on
        if (refs is not null && refs.Missed(step)) { await overlay.HideCursor(); await refs.Take(page, step, index); }
        await overlay.ClearStep();
        t.EndMs = log.Now();
        Close(t);
    }

    /// <summary>click, fill, select, check, uncheck, upload, press with a target.</summary>
    async Task Act(Step step, StepTiming t, int index)
    {
        var locator = Targets.Resolve(page, step.Target!);
        var hiddenInput = step.Action == "upload";
        await Wait(locator, step, index, hiddenInput ? WaitForSelectorState.Attached : WaitForSelectorState.Visible);
        if (!hiddenInput) await locator.ScrollIntoViewIfNeededAsync();

        if (step.Zoom is { } z)
        {
            var before = await BoxOf(locator);
            await overlay.ZoomTo(before, z, cfg.ZoomMs);
        }
        t.Zoom = await overlay.ZoomScale();

        // An upload's input is hidden: point at its visible parent (the drop zone) instead.
        var shown = hiddenInput ? locator.Locator("xpath=..") : locator;
        var box = await BoxOf(shown);
        t.Box = box;
        await Show(step, t, box);

        var holdStart = log.Now();
        if (box is { } b)
        {
            await overlay.MoveCursor(b.CenterX, b.CenterY, cfg.CursorMoveMs);
        }
        await Shot(step, t, box, "step");
        await Reference(step, index, "before", pointing: true);
        var hold = HoldFor(step, index);
        var left = hold - (int)(log.Now() - holdStart);
        if (left > 0) await page.WaitForTimeoutAsync(left);
        t.HoldMs = hold;

        // --shots: no ripple, it would still be fading in the picture taken after the action
        if (refs is null && box is { } c && step.Action is "click" or "check" or "uncheck" or "select" or "fill") await overlay.Ripple(c.CenterX, c.CenterY);
        try { await DoAction(step, locator); }
        catch (Exception e) when (e is TimeoutException or PlaywrightException)
        {
            throw await NotFound(index, step.Action, step.Caption ?? step.Callout, step.Target!, e);
        }
        // The target may be gone (a dialog opened, another page): its box must not float over what comes next.
        await overlay.ClearMarks();
        await Settle(step, index);
        await Reference(step, index, "after");
        if (t.CalloutSpan is not null) t.CalloutSpan.EndMs = log.Now();
        if (t.CaptionSpan is not null) t.CaptionSpan.EndMs = log.Now();

        if (step.Result?.Text is { } resultText && Callouts)
        {
            await overlay.ClearStep();
            Box? rbox = box;
            if (step.Result.Target is { } rt)
            {
                var rl = Targets.Resolve(page, rt);
                await Wait(rl, step, index, WaitForSelectorState.Visible, rt);
                await rl.EvaluateAsync("e => e.scrollIntoView({ block: 'center', behavior: 'instant' })");
                rbox = await BoxOf(rl);
            }
            else if (await locator.IsVisibleAsync()) rbox = await BoxOf(locator);
            if (rbox is { } r) await overlay.Highlight("box", r, ok: true);
            await overlay.Callout(resultText, rbox, step.Placement, null, ok: true, ReserveBottom);
            t.ResultSpan = new Span { Text = resultText, StartMs = log.Now() };
            await Shot(step, t, rbox, "result", resultText);
            await page.WaitForTimeoutAsync(cfg.CalloutHold(resultText));
            t.ResultSpan.EndMs = log.Now();
        }
    }

    async Task DoAction(Step step, ILocator locator)
    {
        switch (step.Action)
        {
            case "click": await locator.ClickAsync(); break;
            // A click, then wait for the state: a checkbox that saves first ticks only when the server answers.
            case "check" or "uncheck":
            {
                var want = step.Action == "check";
                if (await locator.IsCheckedAsync() != want) await locator.ClickAsync();
                var until = DateTime.UtcNow.AddMilliseconds(cfg.FindTimeoutMs);
                while (await locator.IsCheckedAsync() != want)
                {
                    if (DateTime.UtcNow > until) throw new TimeoutException($"the checkbox did not become {(want ? "checked" : "unchecked")}");
                    await page.WaitForTimeoutAsync(100);
                }
                break;
            }
            case "select": await locator.SelectOptionAsync(new SelectOptionValue { Label = step.Value }); break;
            case "upload": await locator.SetInputFilesAsync(step.Files!.Select(f => Path.GetFullPath(f, scenario.SourceDir))); break;
            case "press": await locator.PressAsync(step.Key!); break;
            case "fill":
                await locator.ClickAsync();
                await locator.FillAsync("");
                if (step.Fast == true) await locator.FillAsync(step.Value!);
                else await locator.PressSequentiallyAsync(step.Value!, new() { Delay = cfg.TypeDelayMs });
                break;
        }
    }

    /// <summary>Shows the step's caption (caption bar) and callout (bubble + badge) on box, logging when they appear.</summary>
    async Task Show(Step step, StepTiming t, Box? box)
    {
        var kind = step.Highlight ?? (box is null ? "none" : "box");
        t.Box ??= box;
        string? badge = null;
        if (Callouts && box is not null && step.Callout is not null)
        {
            number++;
            badge = number <= Circled.Length ? Circled[number - 1] : number.ToString();
        }
        if (box is { } b && (kind != "none" || badge is not null)) await overlay.Highlight(kind == "none" ? "box" : kind, b, badge);
        if ((Captions || Clean) && step.Caption is not null)
        {
            if (Captions) await overlay.Caption(step.Caption);
            t.CaptionSpan = new Span { Text = step.Caption, StartMs = log.Now() };
        }
        var calloutText = step.Callout ?? (scenario.Mode == "callout" ? step.Caption : null);
        if (Callouts && calloutText is not null)
        {
            await overlay.Callout(calloutText, box, step.Placement, badge, ok: false, ReserveBottom);
            t.CalloutSpan = new Span { Text = calloutText, StartMs = log.Now() };
        }
    }

    async Task Hold(Step step, StepTiming t, int index, int? explicitMs = null)
    {
        // --shots: no one reads, so no reading time and no title card; a wait step's own time is for the page, it stays
        // a card's or a wait's own time, but never shorter than its spoken sentence (the voice would run into what follows)
        var hold = refs is not null && step.Action != "wait" ? 0
            : explicitMs is { } ms && holdOverrides.TryGetValue(index, out var voiced) ? Math.Max(ms, voiced)
            : explicitMs ?? HoldFor(step, index);
        await Shot(step, t);
        await page.WaitForTimeoutAsync(hold);
        t.HoldMs = hold;
        // a page, a dialog or a card that is only shown: before and after are the same screen (a wait's, once waited)
        await Reference(step, index, "before");
        await Reference(step, index, "after");
    }

    int HoldFor(Step step, int index)
    {
        if (holdOverrides.TryGetValue(index, out var o)) return o;
        if (step.HoldMs is { } h) return h;
        var caption = Captions || Clean ? cfg.CaptionHold(step.Caption) : 0;
        var callout = Callouts ? cfg.CalloutHold(step.Callout ?? (scenario.Mode == "callout" ? step.Caption : null)) : 0;
        var hold = Math.Max(caption, callout);
        return hold == 0 ? cfg.CaptionMinMs : hold;
    }

    // ---- sign in / out ------------------------------------------------------------------------------------------------

    async Task Login(string role, int index, bool auto, StepTiming? into = null)
    {
        var def = scenario.Roles[role];
        var login = scenario.Login!;
        var t = into ?? new StepTiming { Action = "login", Role = role, StartMs = log.Now(), Auto = auto };
        if (into is null) log.Steps.Add(t);
        var caption = login.Caption.Replace("{role}", def.Label is null ? $" {role}" : def.Label);
        t.Caption ??= caption;
        t.Role = role;

        // Wait for the page only when it was just opened (a sign-in page already loaded behind a title card is ready).
        var navigated = currentRole is not null;
        if (navigated) await Logout();
        if (!page.Url.StartsWith(Url(login.Url), StringComparison.OrdinalIgnoreCase)) { await page.GotoAsync(Url(login.Url)); navigated = true; }
        var fake = new Step { Action = "login", Caption = t.Caption };
        if (navigated) await Settle(fake, index);
        await Show(fake, t, null);
        var shownAt = log.Now();

        var email = Targets.Resolve(page, login.Email);
        var password = Targets.Resolve(page, login.Password);
        var submit = Targets.Resolve(page, login.Submit);
        await Wait(email, fake, index, WaitForSelectorState.Visible, login.Email);
        foreach (var (field, value) in new[] { (email, secrets.Get(def.UserKey, "email")!), (password, secrets.Get(def.UserKey, "password")!) })
        {
            var b = await BoxOf(field);
            await overlay.ClearMarks();
            if (b is { } bb) { await overlay.Highlight("box", bb); await overlay.MoveCursor(bb.CenterX, bb.CenterY, cfg.CursorMoveMs); }
            await field.ClickAsync();
            await field.PressSequentiallyAsync(value, new() { Delay = cfg.TypeDelayMs / 2 });
        }
        var sb = await BoxOf(submit);
        await overlay.ClearMarks();
        if (sb is { } s) { await overlay.MoveCursor(s.CenterX, s.CenterY, cfg.CursorMoveMs); await overlay.Ripple(s.CenterX, s.CenterY); }
        var loginUrl = Url(login.Url);
        await submit.ClickAsync();
        try
        {
            await page.WaitForURLAsync(u => !u.StartsWith(loginUrl, StringComparison.OrdinalIgnoreCase), new() { Timeout = cfg.FindTimeoutMs });
        }
        catch (TimeoutException e) { throw await NotFound(index, "login", caption, $"(a page after {login.Url})", e); }
        if (login.Done is { } done) await Wait(Targets.Resolve(page, done), fake, index, WaitForSelectorState.Visible, done);
        await Settle(fake, index);
        // An explicit sign-in with narration lasts at least as long as its sentence.
        if (!auto && HoldFor(new Step { Caption = t.Caption }, index) is var min && holdOverrides.ContainsKey(index))
        {
            var left = min - (int)(log.Now() - shownAt);
            if (left > 0) await page.WaitForTimeoutAsync(left);
            t.HoldMs = min;
        }
        currentRole = role;
        if (into is null)
        {
            await overlay.ClearStep();
            t.EndMs = log.Now();
            Close(t);
        }
    }

    async Task Logout()
    {
        await overlay.ClearStep();
        await context.ClearCookiesAsync();
        try { await page.EvaluateAsync("() => { localStorage.clear(); sessionStorage.clear(); }"); } catch (PlaywrightException) { }
        await page.GotoAsync(Url(scenario.Login!.Url));
        currentRole = null;
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------

    string Url(string path) => Uri.TryCreate(path, UriKind.Absolute, out var abs) ? abs.ToString() : new Uri(new Uri(scenario.BaseUrl), path).ToString();

    async Task<Box?> Find(Step step, int index)
    {
        if (step.Target is null) return null;
        var l = Targets.Resolve(page, step.Target);
        await Wait(l, step, index, WaitForSelectorState.Visible);
        await l.ScrollIntoViewIfNeededAsync();
        return await BoxOf(l);
    }

    async Task Wait(ILocator l, Step step, int index, WaitForSelectorState state, string? target = null)
    {
        try { await l.WaitForAsync(new() { State = state, Timeout = cfg.FindTimeoutMs }); }
        catch (Exception e) when (e is TimeoutException or PlaywrightException)
        {
            throw await NotFound(index, step.Action, step.Caption ?? step.Callout, target ?? step.Target ?? "", e);
        }
    }

    async Task<TargetNotFoundException> NotFound(int index, string action, string? caption, string target, Exception e)
    {
        Directory.CreateDirectory(shotsDir);
        var file = Path.Combine(shotsDir, $"failed-step-{index:00}.png");
        try { await page.ScreenshotAsync(new() { Path = file }); } catch (PlaywrightException) { file = "(screenshot failed)"; }
        return new TargetNotFoundException(index, action, caption, target, file, e);
    }

    static async Task<Box?> BoxOf(ILocator l)
    {
        var b = await l.BoundingBoxAsync();
        return b is null ? null : new Box(b.X, b.Y, b.Width, b.Height);
    }

    async Task Settle(Step step, int index)
    {
        try { await page.WaitForLoadStateAsync(LoadState.NetworkIdle, new() { Timeout = cfg.SettleTimeoutMs }); }
        catch (TimeoutException) { /* a page that polls never goes idle; the waitFor target is the real signal */ }
        if (step.WaitFor is { } w) await Wait(Targets.Resolve(page, w), step, index, WaitForSelectorState.Visible, w);
        await page.EvaluateAsync("() => document.fonts ? document.fonts.ready.then(() => true) : true");
        log.FirstContentMs ??= log.Now();
    }

    /// <summary>
    /// A picture with the overlay (NN.png, for the manual) and the same screen without it (NN-clean.png), with the box it
    /// points at, so a motion tool (HyperFrames) can draw its own highlight and zoom.
    /// </summary>
    async Task Shot(Step step, StepTiming t, Box? box = null, string kind = "step", string? text = null)
    {
        if (!takeShots || step.NoShot == true || (t.CalloutSpan is null && t.ResultSpan is null && t.CaptionSpan is null)) return;
        Directory.CreateDirectory(shotsDir);
        await page.WaitForTimeoutAsync(320); // let the pop / fade-in animations (≤ 260 ms) finish
        var n = ++shot;
        var name = $"{n:00}.png";
        var clean = $"{n:00}-clean.png";
        await page.ScreenshotAsync(new() { Path = Path.Combine(shotsDir, name) });
        await page.EvaluateAsync("() => { const r = document.getElementById('__tour-root'); if (r) r.style.visibility = 'hidden' }");
        await page.ScreenshotAsync(new() { Path = Path.Combine(shotsDir, clean) });
        await page.EvaluateAsync("() => { const r = document.getElementById('__tour-root'); if (r) r.style.visibility = '' }");
        t.Screenshots.Add($"steps/{name}");
        t.Frames.Add(new Frame
        {
            Kind = kind,
            Annotated = $"steps/{name}",
            Clean = $"steps/{clean}",
            Box = box ?? t.Box,
            Zoom = await overlay.ZoomScale(),
            Text = text ?? (kind == "result" ? t.ResultSpan?.Text : t.CalloutSpan?.Text ?? t.CaptionSpan?.Text),
        });
    }

    void Close(StepTiming t)
    {
        foreach (var sp in new[] { t.CaptionSpan, t.CalloutSpan })
            if (sp is not null && sp.EndMs == 0) sp.EndMs = t.EndMs;
    }
}
