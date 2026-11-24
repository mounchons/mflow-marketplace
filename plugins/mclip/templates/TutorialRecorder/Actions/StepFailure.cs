namespace TutorialRecorder.Actions;

/// <summary>A slide step whose picture could not be drawn (a broken or unsupported file): the run stops, no blank slide.</summary>
public sealed class SlideFailedException(int step, string image, string why)
    : Exception($"step {step} (slide) could not show {image}: {why}. Make the picture again (/mclip:plan edit) or replace the file.");

/// <summary>A step that could not find its target or whose action failed; the run stops with a screenshot.</summary>
public sealed class TargetNotFoundException(int step, string action, string? caption, string target, string screenshot, Exception inner)
    : Exception(Describe(step, action, caption, target, screenshot, inner), inner)
{
    public int Step { get; } = step;
    public string Target { get; } = target;

    static string Describe(int step, string action, string? caption, string target, string screenshot, Exception inner)
    {
        var what = caption is null ? action : $"{action}: {caption}";
        var why = inner.Message.Split('\n', 2)[0].Trim();
        return $"step {step} ({what}) failed on target '{target}': {why}{Environment.NewLine}  Screenshot: {screenshot}";
    }
}
