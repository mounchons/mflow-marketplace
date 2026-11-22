using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text;

namespace TutorialRecorder.Writing;

public static class Writers
{
    /// <summary>One cue per caption, callout and result, in time order.</summary>
    public static IEnumerable<Span> Cues(TimingLog log) =>
        log.Steps.SelectMany(s => new[] { s.CaptionSpan, s.CalloutSpan, s.ResultSpan })
            .Where(c => c is not null && !string.IsNullOrWhiteSpace(c.Text) && c.EndMs > c.StartMs)
            .Select(c => c!)
            .OrderBy(c => c.StartMs);

    public static string Srt(TimingLog log)
    {
        var sb = new StringBuilder();
        var n = 0;
        foreach (var c in Cues(log))
            sb.Append(++n).Append('\n').Append(Ts(c.StartMs, ',')).Append(" --> ").Append(Ts(c.EndMs, ',')).Append('\n').Append(c.Text).Append("\n\n");
        return sb.ToString();
    }

    public static string Vtt(TimingLog log)
    {
        var sb = new StringBuilder("WEBVTT\n\n");
        foreach (var c in Cues(log)) sb.Append(Ts(c.StartMs, '.')).Append(" --> ").Append(Ts(c.EndMs, '.')).Append('\n').Append(c.Text).Append("\n\n");
        return sb.ToString();
    }

    static string Ts(long ms, char sep)
    {
        var t = TimeSpan.FromMilliseconds(Math.Max(0, ms));
        return $"{(int)t.TotalHours:00}:{t.Minutes:00}:{t.Seconds:00}{sep}{t.Milliseconds:000}";
    }

    /// <summary>A manual from the same script: one section per step, its pictures and texts.</summary>
    public static string Manual(TimingLog log)
    {
        var sb = new StringBuilder();
        sb.Append("# ").Append(log.Title ?? log.Clip).Append("\n\n");
        var n = 0;
        foreach (var s in log.Steps.Where(s => s.Screenshots.Count > 0 || s.CalloutSpan is not null || s.Caption is not null))
        {
            var text = s.CalloutSpan?.Text ?? s.Caption ?? s.Action;
            sb.Append("## ").Append(++n).Append(". ").Append(text).Append("\n\n");
            if (s.Caption is not null && s.CalloutSpan is not null && s.Caption != s.CalloutSpan.Text) sb.Append(s.Caption).Append("\n\n");
            foreach (var shot in s.Screenshots) sb.Append("![ขั้นที่ ").Append(n).Append("](").Append(shot).Append(")\n\n");
            if (s.ResultSpan is not null) sb.Append("✓ ").Append(s.ResultSpan.Text).Append("\n\n");
        }
        return sb.ToString();
    }

    /// <summary>
    /// A page to check the clip like a storyboard: the video with its subtitles, the steps beside it; a click on a step
    /// jumps there. Everything is inline (a file:// page cannot fetch its neighbours), the mp4 is referenced.
    /// </summary>
    public static string Review(TimingLog log, string videoRelPath)
    {
        var json = log.ToJson().Replace("</", "<\\/");
        var vtt = System.Text.Json.JsonSerializer.Serialize(Vtt(log));
        var title = WebUtility.HtmlEncode(log.Title ?? log.Clip);
        return $$"""
<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}} — review</title>
<style>
  :root { color-scheme: light; font-family: "Noto Sans Thai", "Sarabun", "Leelawadee UI", Tahoma, sans-serif; }
  body { margin: 0; background: #f1f5f9; color: #0f172a; }
  header { padding: 12px 20px; background: #173f8f; color: #fff; display: flex; gap: 16px; align-items: baseline; }
  header h1 { font-size: 18px; margin: 0; } header span { opacity: .8; font-size: 13px; }
  main { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 16px; padding: 16px; }
  video { width: 100%; background: #000; border-radius: 8px; }
  ol { list-style: none; margin: 0; padding: 0; max-height: calc(100vh - 110px); overflow: auto; }
  li { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; }
  li:hover { border-color: #93c5fd; } li.on { border-color: #173f8f; box-shadow: 0 0 0 2px #173f8f33; }
  .n { font-weight: 700; color: #173f8f; margin-right: 6px; } .t { font-size: 12px; color: #64748b; float: right; }
  .a { font-size: 12px; color: #64748b; } .nar { font-size: 13px; color: #334155; margin-top: 4px; }
  .co { font-size: 13px; margin-top: 4px; color: #1e3a8a; } .ok { color: #15803d; }
  .auto { opacity: .7; }
  @media (max-width: 1000px) { main { grid-template-columns: 1fr; } }
</style></head>
<body>
<header><h1>{{title}}</h1><span id="meta"></span></header>
<main>
  <div><video id="v" controls preload="metadata" src="{{WebUtility.HtmlEncode(videoRelPath)}}"></video></div>
  <ol id="steps"></ol>
</main>
<script>
const log = {{json}};
const vtt = {{vtt}};
const v = document.getElementById('v');
const track = document.createElement('track');
track.kind = 'subtitles'; track.label = 'ไทย'; track.srclang = 'th'; track.default = true;
track.src = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
v.appendChild(track);
const fmt = (ms) => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
document.getElementById('meta').textContent = `${log.steps.length} steps · ${fmt(log.durationMs)} · mode ${log.mode} · ${new Date(log.recordedAt).toLocaleString('th-TH')}`;
const ol = document.getElementById('steps');
const items = log.steps.map((s) => {
  const li = document.createElement('li');
  if (s.auto) li.className = 'auto';
  const add = (cls, text) => { if (!text) return; const d = document.createElement('div'); d.className = cls; d.textContent = text; li.appendChild(d); };
  const head = document.createElement('div');
  const n = document.createElement('span'); n.className = 'n'; n.textContent = s.index; head.appendChild(n);
  head.appendChild(document.createTextNode(s.caption || s.calloutSpan?.text || s.action));
  const t = document.createElement('span'); t.className = 't'; t.textContent = `${fmt(s.startMs)}–${fmt(s.endMs)}`; head.appendChild(t);
  li.appendChild(head);
  add('a', `${s.action}${s.role ? ' · ' + s.role : ''}${s.target ? ' · ' + s.target : ''}${s.zoom > 1 ? ' · zoom ' + s.zoom : ''}`);
  if (s.calloutSpan && s.calloutSpan.text !== s.caption) add('co', s.calloutSpan.text);
  if (s.resultSpan) add('co ok', '✓ ' + s.resultSpan.text);
  add('nar', s.narration ? '🎙 ' + s.narration : '');
  li.onclick = () => { v.currentTime = s.startMs / 1000; v.play(); };
  ol.appendChild(li);
  return li;
});
v.addEventListener('timeupdate', () => {
  const ms = v.currentTime * 1000;
  items.forEach((li, i) => { const s = log.steps[i]; const on = ms >= s.startMs && ms < s.endMs; if (on !== li.classList.contains('on')) { li.classList.toggle('on', on); if (on) li.scrollIntoView({ block: 'nearest' }); } });
});
</script>
</body></html>
""";
    }

    /// <summary>webm → mp4 (H.264, yuv420p, faststart), cutting the blank lead-in.</summary>
    public static void ToMp4(string webm, string mp4, long trimMs, int crf)
    {
        var ss = (trimMs / 1000.0).ToString("0.000", CultureInfo.InvariantCulture);
        var psi = new ProcessStartInfo("ffmpeg")
        {
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        foreach (var a in new[] { "-y", "-hide_banner", "-loglevel", "error", "-i", webm, "-ss", ss, "-c:v", "libx264", "-preset", "slow",
                     "-crf", crf.ToString(CultureInfo.InvariantCulture), "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", "-an", mp4 })
            psi.ArgumentList.Add(a);
        using var p = Process.Start(psi) ?? throw new InvalidOperationException("ffmpeg did not start (is it on PATH?)");
        var err = p.StandardError.ReadToEnd();
        p.WaitForExit();
        if (p.ExitCode != 0) throw new InvalidOperationException($"ffmpeg failed ({p.ExitCode}): {err}");
    }
}
