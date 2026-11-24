namespace TutorialRecorder.Scenario;

/// <summary>A clip's script (YAML). Credentials never live here: a role names a userKey that Secrets resolves.</summary>
public sealed class ScenarioFile
{
    public string Clip { get; set; } = "";
    public string? Title { get; set; }
    public string BaseUrl { get; set; } = "";
    /// <summary>caption (default) | callout | both</summary>
    public string Mode { get; set; } = "caption";
    /// <summary>A command run before recording, from the scenario's folder, to reset the test data (skip with --no-setup).</summary>
    public string? Setup { get; set; }
    public Dictionary<string, RoleDef> Roles { get; set; } = new();
    public LoginDef? Login { get; set; }
    public List<Step> Steps { get; set; } = new();
    /// <summary>The scenario file's folder: upload files are relative to it.</summary>
    [YamlDotNet.Serialization.YamlIgnore] public string SourceDir { get; set; } = "";
}

public sealed class RoleDef
{
    public string UserKey { get; set; } = "";
    /// <summary>The role's name as the viewer reads it, e.g. "ผู้ดูแลสำนักงาน".</summary>
    public string? Label { get; set; }
}

/// <summary>How to sign in, so the tool knows nothing of one app. Targets use the same selector forms as steps.</summary>
public sealed class LoginDef
{
    public string Url { get; set; } = "/login";
    public string Email { get; set; } = "label:อีเมล";
    public string Password { get; set; } = "label:รหัสผ่าน";
    public string Submit { get; set; } = "role:button|เข้าสู่ระบบ";
    /// <summary>A target that shows once signed in (optional); otherwise the URL leaving the login page is enough.</summary>
    public string? Done { get; set; }
    /// <summary>Caption shown while signing in; {role} is the role's label.</summary>
    public string Caption { get; set; } = "เข้าสู่ระบบในฐานะ{role}";
}

public sealed class Step
{
    public string? Role { get; set; }
    /// <summary>navigate | click | fill | select | check | uncheck | upload | press | wait | zoom | zoom-out | login | logout | title | slide</summary>
    public string Action { get; set; } = "";
    public string? Target { get; set; }
    public string? Value { get; set; }
    public string? Url { get; set; }
    public List<string>? Files { get; set; }
    /// <summary>slide: the picture shown full screen, slides/&lt;name&gt;.png, .jpg or .svg in the scenario's folder.</summary>
    public string? Image { get; set; }
    public string? Key { get; set; }
    public double? Zoom { get; set; }
    /// <summary>box | arrow | spotlight | none (default box when there is a target)</summary>
    public string? Highlight { get; set; }
    public string? Caption { get; set; }
    /// <summary>title: the line under the card's title.</summary>
    public string? Subtitle { get; set; }
    public string? Narration { get; set; }
    public string? Callout { get; set; }
    public ResultDef? Result { get; set; }
    /// <summary>auto | top | bottom | left | right</summary>
    public string? Placement { get; set; }
    /// <summary>A target to wait for after the action (the next screen), on top of the network settling.</summary>
    public string? WaitFor { get; set; }
    /// <summary>Overrides the computed reading time (ms). The TTS round sets it from the audio's length.</summary>
    public int? HoldMs { get; set; }
    /// <summary>fill: type all at once instead of letter by letter.</summary>
    public bool? Fast { get; set; }
    /// <summary>Leave the step out of the manual's pictures.</summary>
    public bool? NoShot { get; set; }
    /// <summary>--shots: the lesson's reference picture this step shows, screen/&lt;name&gt;.jpg in the scenario's folder.</summary>
    public string? Shot { get; set; }
    /// <summary>before (default): the target marked, before the action; after: once the action has settled.</summary>
    public string? ShotAt { get; set; }
}

public sealed class ResultDef
{
    public string? Target { get; set; }
    public string? Text { get; set; }
}
