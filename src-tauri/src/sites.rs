//! Best-effort website detection for browser windows.
//!
//! Only the domain is ever kept — never the full URL or page title (unless the
//! user opts in to storing titles).

/// Title fragments browsers show for well-known sites, mapped to their domain.
/// Matched case-insensitively against the window title.
const TITLE_HINTS: &[(&str, &str)] = &[
    ("youtube music", "music.youtube.com"),
    ("youtube", "youtube.com"),
    ("github", "github.com"),
    ("gitlab", "gitlab.com"),
    ("gmail", "mail.google.com"),
    ("inbox (", "mail.google.com"),
    ("google docs", "docs.google.com"),
    ("google sheets", "sheets.google.com"),
    ("google slides", "slides.google.com"),
    ("google calendar", "calendar.google.com"),
    ("google drive", "drive.google.com"),
    ("google meet", "meet.google.com"),
    ("meet - ", "meet.google.com"),
    ("google search", "google.com"),
    ("stack overflow", "stackoverflow.com"),
    ("reddit", "reddit.com"),
    (" / x", "x.com"),
    (" on x:", "x.com"),
    ("twitter", "twitter.com"),
    ("facebook", "facebook.com"),
    ("instagram", "instagram.com"),
    ("linkedin", "linkedin.com"),
    ("netflix", "netflix.com"),
    ("prime video", "primevideo.com"),
    ("disney+", "disneyplus.com"),
    ("twitch", "twitch.tv"),
    ("notion", "notion.so"),
    ("figma", "figma.com"),
    ("slack", "app.slack.com"),
    ("discord", "discord.com"),
    ("whatsapp", "web.whatsapp.com"),
    ("telegram", "web.telegram.org"),
    ("messenger", "messenger.com"),
    ("chatgpt", "chatgpt.com"),
    ("claude", "claude.ai"),
    ("perplexity", "perplexity.ai"),
    ("gemini", "gemini.google.com"),
    ("wikipedia", "wikipedia.org"),
    ("medium", "medium.com"),
    ("hacker news", "news.ycombinator.com"),
    ("amazon.com", "amazon.com"),
    ("ebay", "ebay.com"),
    ("jira", "atlassian.net"),
    ("confluence", "atlassian.net"),
    ("linear", "linear.app"),
    ("trello", "trello.com"),
    ("asana", "asana.com"),
    ("spotify", "open.spotify.com"),
    ("outlook", "outlook.office.com"),
    ("microsoft teams", "teams.microsoft.com"),
    ("zoom", "zoom.us"),
    ("dribbble", "dribbble.com"),
    ("behance", "behance.net"),
    ("codepen", "codepen.io"),
    ("vercel", "vercel.com"),
    ("mdn web docs", "developer.mozilla.org"),
    ("dev community", "dev.to"),
    ("coursera", "coursera.org"),
    ("udemy", "udemy.com"),
    ("khan academy", "khanacademy.org"),
    ("duolingo", "duolingo.com"),
    ("tiktok", "tiktok.com"),
    ("pinterest", "pinterest.com"),
    ("quora", "quora.com"),
    ("the new york times", "nytimes.com"),
    ("the guardian", "theguardian.com"),
    ("bbc", "bbc.com"),
    ("cnn", "cnn.com"),
    ("bloomberg", "bloomberg.com"),
    ("the verge", "theverge.com"),
    ("espn", "espn.com"),
    ("canva", "canva.com"),
    ("miro", "miro.com"),
    ("chess.com", "chess.com"),
    ("lichess", "lichess.org"),
    ("leetcode", "leetcode.com"),
    ("overleaf", "overleaf.com"),
    ("crunchyroll", "crunchyroll.com"),
    ("imdb", "imdb.com"),
    ("aliexpress", "aliexpress.com"),
    ("etsy", "etsy.com"),
];

/// Guess the site from a browser window title, e.g. "Pull requests · GitHub — Mozilla Firefox".
pub fn domain_from_title(title: &str) -> Option<String> {
    let lower = title.to_lowercase();
    if lower.trim().is_empty() {
        return None;
    }
    // A bare host in the title (common for dev servers and simple pages).
    for token in lower.split(|c: char| c.is_whitespace() || c == '|' || c == '—' || c == '–') {
        if let Some(domain) = domain_from_url(token) {
            if domain.contains('.') && !domain.ends_with('.') && looks_like_host(&domain) {
                return Some(domain);
            }
        }
    }
    TITLE_HINTS
        .iter()
        .find(|(needle, _)| contains_word(&lower, needle))
        .map(|(_, domain)| domain.to_string())
}

/// Extract the host from a URL (or bare host), dropping any `www.` prefix.
pub fn domain_from_url(url: &str) -> Option<String> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }
    let rest = match url.find("://") {
        Some(i) => {
            let scheme = &url[..i];
            if !matches!(scheme, "http" | "https") {
                return None;
            }
            &url[i + 3..]
        }
        None => url,
    };
    let host_port = rest.split(['/', '?', '#']).next()?;
    let host_port = host_port.rsplit('@').next()?;
    let host = host_port.split(':').next()?.trim_end_matches('.');
    if host.is_empty() {
        return None;
    }
    let host = host.strip_prefix("www.").unwrap_or(host);
    Some(host.to_ascii_lowercase())
}

/// TLDs we accept for bare hosts in titles; keeps "Node.js" or "index.html" from
/// being mistaken for a site.
const COMMON_TLDS: &[&str] = &[
    "com", "org", "net", "io", "dev", "app", "ai", "co", "so", "me", "edu", "gov", "tv", "gg",
    "xyz", "info", "us", "uk", "de", "in", "bd", "page", "site", "sh", "to", "rs", "ly", "fm",
    "design", "tech", "cloud", "news", "blog", "ca", "au", "fr", "nl", "es", "it", "jp", "eu",
];

fn looks_like_host(s: &str) -> bool {
    let tld = s.rsplit('.').next().unwrap_or("");
    (s == "localhost" || COMMON_TLDS.contains(&tld))
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

/// Substring match that refuses to match inside a longer word ("miro" ≠ "mirror").
fn contains_word(haystack: &str, needle: &str) -> bool {
    let bytes = haystack.as_bytes();
    let mut start = 0;
    while let Some(pos) = haystack[start..].find(needle) {
        let begin = start + pos;
        let end = begin + needle.len();
        let edge = |b: u8| !b.is_ascii_alphanumeric();
        let ok_before = begin == 0 || edge(bytes[begin - 1]) || !needle.as_bytes()[0].is_ascii_alphanumeric();
        let ok_after = end >= bytes.len()
            || edge(bytes[end])
            || !needle.as_bytes()[needle.len() - 1].is_ascii_alphanumeric();
        if ok_before && ok_after {
            return true;
        }
        start = begin + needle.len().max(1);
        if start >= haystack.len() {
            break;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_urls() {
        assert_eq!(domain_from_url("https://www.youtube.com/watch?v=1").as_deref(), Some("youtube.com"));
        assert_eq!(domain_from_url("http://localhost:5173/app").as_deref(), Some("localhost"));
        assert_eq!(domain_from_url("https://user@docs.rs/serde").as_deref(), Some("docs.rs"));
        assert_eq!(domain_from_url("file:///Users/me/a.html"), None);
        assert_eq!(domain_from_url("chrome://settings"), None);
    }

    #[test]
    fn detects_sites_from_titles() {
        assert_eq!(
            domain_from_title("Lo-fi beats to study to - YouTube - Google Chrome").as_deref(),
            Some("youtube.com")
        );
        assert_eq!(
            domain_from_title("Pull requests · tauri-apps/tauri · GitHub — Mozilla Firefox").as_deref(),
            Some("github.com")
        );
        assert_eq!(domain_from_title("Home / X").as_deref(), Some("x.com"));
        assert_eq!(domain_from_title("example.org — Safari").as_deref(), Some("example.org"));
        assert_eq!(domain_from_title("Mirror settings").as_deref(), None);
        assert_eq!(domain_from_title("New Tab"), None);
    }
}
