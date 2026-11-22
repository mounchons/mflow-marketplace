using Microsoft.Playwright;

namespace TutorialRecorder.Actions;

/// <summary>
/// Turns a scenario target into a locator. Forms (parts joined by " >> " narrow from left to right):
///   tour:btn-add-user            [data-tour="btn-add-user"] (preferred: survives CSS and text changes)
///   testid:approve-button        [data-testid=...]
///   label:อีเมล                  the field with that label (exact)
///   label~:^รหัสผ่านใหม่อย่าง      the field whose label matches a regex (a label that also holds its hint)
///   role:button|เพิ่มผู้ใช้        a role with that accessible name (exact); role:dialog alone for any
///   text:ผู้ใช้และสิทธิ์            visible text (exact)
///   placeholder:DD/MM/YYYY
///   anything else                a Playwright selector as is (CSS, [data-tour=x], ...)
/// </summary>
public static class Targets
{
    public static ILocator Resolve(IPage page, string target)
    {
        ILocator? current = null;
        foreach (var raw in target.Split(" >> ", StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            current = Part(page, current, raw);
        return current ?? throw new ArgumentException($"empty target '{target}'");
    }

    static ILocator Part(IPage page, ILocator? within, string part)
    {
        var i = part.StartsWith("label~:", StringComparison.Ordinal) ? 6 : part.IndexOf(':');
        var kind = i > 0 ? part[..i] : "";
        var arg = i > 0 ? part[(i + 1)..] : part;
        switch (kind)
        {
            case "tour": return Css(page, within, $"[data-tour=\"{arg}\"]");
            case "testid": return within?.GetByTestId(arg) ?? page.GetByTestId(arg);
            case "label":
                return within?.GetByLabel(arg, new() { Exact = true }) ?? page.GetByLabel(arg, new() { Exact = true });
            case "label~":
            {
                var re = new System.Text.RegularExpressions.Regex(arg);
                return within?.GetByLabel(re) ?? page.GetByLabel(re);
            }
            case "text":
                return within?.GetByText(arg, new() { Exact = true }) ?? page.GetByText(arg, new() { Exact = true });
            case "placeholder":
                return within?.GetByPlaceholder(arg, new() { Exact = true }) ?? page.GetByPlaceholder(arg, new() { Exact = true });
            case "role":
            {
                var bar = arg.IndexOf('|');
                var roleName = bar >= 0 ? arg[..bar] : arg;
                if (!Enum.TryParse<AriaRole>(roleName, ignoreCase: true, out var role)) throw new ArgumentException($"unknown role '{roleName}' in '{part}'");
                var opts = bar >= 0 ? new LocatorGetByRoleOptions { Name = arg[(bar + 1)..], Exact = true } : null;
                var popts = bar >= 0 ? new PageGetByRoleOptions { Name = arg[(bar + 1)..], Exact = true } : null;
                return within?.GetByRole(role, opts) ?? page.GetByRole(role, popts);
            }
            default: return Css(page, within, part);
        }
    }

    static ILocator Css(IPage page, ILocator? within, string selector) => within?.Locator(selector) ?? page.Locator(selector);
}
