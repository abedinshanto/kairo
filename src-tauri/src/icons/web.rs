//! Only when the user turns on "Download site icons": ask a site for its own
//! icon, for sites no browser on this computer has saved one for. The request
//! goes to that site alone, over HTTPS, and carries nothing about the user.
//! It uses the system's curl (part of macOS, Windows 10 and later, and nearly
//! every Linux system), so Kairo itself ships no networking code.

use std::{
    io::Read,
    process::{Command, Stdio},
};

use tauri::Url;

use super::Icon;

const MAX_PAGE: usize = 768 * 1024;
const MAX_ICON: usize = 256 * 1024;
/// Some sites only serve their real page to browsers.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/// Public sites only: no local names, bare addresses or odd characters.
pub fn allowed(domain: &str) -> bool {
    let labels: Vec<&str> = domain.split('.').collect();
    labels.len() >= 2
        && labels.iter().all(|l| {
            !l.is_empty()
                && l.len() <= 63
                && l.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        })
        && !labels.iter().all(|l| l.chars().all(|c| c.is_ascii_digit()))
        && !matches!(
            labels.last().copied(),
            Some("local" | "lan" | "internal" | "home" | "localhost" | "test" | "invalid" | "arpa")
        )
}

/// The site's best icon: one its page links to, else the usual fixed paths.
pub fn fetch(domain: &str) -> Option<Icon> {
    if !allowed(domain) {
        return None;
    }
    let base = Url::parse(&format!("https://{domain}/")).ok()?;
    let mut candidates = get(base.as_str(), MAX_PAGE)
        .map(|page| icon_links(&String::from_utf8_lossy(&page), &base))
        .unwrap_or_default();
    candidates.truncate(2);
    for path in ["/apple-touch-icon.png", "/favicon.ico"] {
        if let Ok(url) = base.join(path) {
            if !candidates.contains(&url) {
                candidates.push(url);
            }
        }
    }
    candidates.into_iter().find_map(|url| {
        let data = get(url.as_str(), MAX_ICON)?;
        let mime = sniff(&data)?;
        Some(Icon { mime, data })
    })
}

/// GET over HTTPS (redirects too), giving up on anything slow or too big.
fn get(url: &str, max: usize) -> Option<Vec<u8>> {
    let max_s = max.to_string();
    let mut cmd = Command::new("curl");
    cmd.args([
        "--silent",
        "--fail",
        "--location",
        "--max-redirs",
        "5",
        "--max-time",
        "8",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--max-filesize",
        &max_s,
        "--user-agent",
        USER_AGENT,
        url,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window flashing up.
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().ok()?;
    let mut body = Vec::new();
    let read = child.stdout.take()?.take(max as u64 + 1).read_to_end(&mut body);
    if read.is_err() || body.len() > max {
        let _ = child.kill();
        let _ = child.wait();
        return None;
    }
    let ok = child.wait().ok()?.success();
    (ok && !body.is_empty()).then_some(body)
}

/// Icons a page links to, best first: big PNGs (apple-touch-icon), SVGs, then
/// declared sizes. Monochrome Safari pinned-tab masks are skipped.
fn icon_links(html: &str, base: &Url) -> Vec<Url> {
    let lower = html.to_ascii_lowercase();
    let mut found: Vec<(u32, Url)> = Vec::new();
    let mut at = 0;
    while let Some(i) = lower[at..].find("<link") {
        let start = at + i;
        let Some(len) = lower[start..].find('>') else { break };
        let tag = &html[start..start + len];
        at = start + len;
        let attr = |name: &str| attribute(tag, name);
        let rel = attr("rel").unwrap_or_default().to_ascii_lowercase();
        let rels: Vec<&str> = rel.split_ascii_whitespace().collect();
        if rels.contains(&"mask-icon") || !rels.iter().any(|r| r.contains("icon")) {
            continue;
        }
        let Some(href) = attr("href").map(|h| h.replace("&amp;", "&")) else { continue };
        let Ok(url) = base.join(href.trim()) else { continue };
        if url.scheme() != "https" {
            continue;
        }
        let svg = attr("type").is_some_and(|t| t.contains("svg")) || url.path().ends_with(".svg");
        let declared = attr("sizes")
            .unwrap_or_default()
            .split_ascii_whitespace()
            .filter_map(|s| s.split(['x', 'X']).next()?.parse::<u32>().ok())
            .max();
        let score = if svg {
            300
        } else if let Some(px) = declared {
            px.min(256)
        } else if rels.iter().any(|r| r.starts_with("apple-touch-icon")) {
            180
        } else {
            32
        };
        found.push((score, url));
    }
    found.sort_by_key(|(score, _)| std::cmp::Reverse(*score));
    let mut urls: Vec<Url> = Vec::new();
    for (_, url) in found {
        if !urls.contains(&url) {
            urls.push(url);
        }
    }
    urls
}

/// The value of `name="…"` (or '…', or bare) in a tag.
fn attribute(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(i) = lower[from..].find(name) {
        let pos = from + i;
        from = pos + name.len();
        // Whole attribute names only ("href" must not match "hreflang").
        let before = lower[..pos].chars().last();
        if !before.is_some_and(|c| c.is_ascii_whitespace()) {
            continue;
        }
        let rest = lower[from..].trim_start();
        let Some(rest) = rest.strip_prefix('=') else { continue };
        let offset = tag.len() - rest.len();
        let raw = tag[offset..].trim_start();
        let value = match raw.chars().next()? {
            q @ ('"' | '\'') => raw[1..].split(q).next()?,
            _ => raw.split(|c: char| c.is_ascii_whitespace() || c == '>').next()?,
        };
        return Some(value.to_string());
    }
    None
}

/// The image type from its first bytes; anything else (an error page) is refused.
fn sniff(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        // Width in the header: skip 1x1 placeholders.
        let width = u32::from_be_bytes(data.get(16..20)?.try_into().ok()?);
        return (width >= 16).then_some("image/png");
    }
    if data.starts_with(&[0, 0, 1, 0]) {
        return Some("image/x-icon");
    }
    if data.starts_with(b"GIF8") {
        return Some("image/gif");
    }
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if data.len() > 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    let head = String::from_utf8_lossy(&data[..data.len().min(1024)]).to_ascii_lowercase();
    (head.contains("<svg") && !head.contains("<html")).then_some("image/svg+xml")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_public_domains_are_asked() {
        assert!(allowed("chatgpt.com"));
        assert!(allowed("reanime.to"));
        assert!(allowed("news.ycombinator.com"));
        assert!(!allowed("localhost"));
        assert!(!allowed("192.168.1.1"));
        assert!(!allowed("printer.local"));
        assert!(!allowed("bad host.com"));
        assert!(!allowed("-x.com/../"));
    }

    #[test]
    fn picks_the_best_linked_icon() {
        let base = Url::parse("https://example.com/").unwrap();
        let html = r##"<html><head>
            <link rel="stylesheet" href="/app.css">
            <LINK REL="icon" type="image/png" sizes="16x16" href="/fav-16.png">
            <link rel=icon sizes="32x32" href=/fav-32.png>
            <link rel="apple-touch-icon" href="https://cdn.example.com/touch.png?v=1&amp;x=2">
            <link rel="mask-icon" href="/mask.svg" color="#000">
            <link hreflang="en" rel="alternate icon" href="/alt.ico">
        </head></html>"##;
        let urls: Vec<String> = icon_links(html, &base).into_iter().map(|u| u.to_string()).collect();
        assert_eq!(
            urls,
            vec![
                "https://cdn.example.com/touch.png?v=1&x=2",
                "https://example.com/fav-32.png",
                "https://example.com/alt.ico",
                "https://example.com/fav-16.png",
            ]
        );
    }

    #[test]
    fn svg_icons_win_and_insecure_ones_are_skipped() {
        let base = Url::parse("https://example.com/a/").unwrap();
        let html = r#"<link rel="icon" href="http://example.com/x.png"><link rel="icon" href="logo.svg">"#;
        let urls: Vec<String> = icon_links(html, &base).into_iter().map(|u| u.to_string()).collect();
        assert_eq!(urls, vec!["https://example.com/a/logo.svg"]);
    }

    #[test]
    fn sniffs_images_and_refuses_pages() {
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend_from_slice(&32u32.to_be_bytes());
        png.extend_from_slice(&32u32.to_be_bytes());
        assert_eq!(sniff(&png), Some("image/png"));
        let mut tiny = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        tiny.extend_from_slice(&1u32.to_be_bytes());
        tiny.extend_from_slice(&1u32.to_be_bytes());
        assert_eq!(sniff(&tiny), None);
        assert_eq!(sniff(&[0, 0, 1, 0, 1, 0]), Some("image/x-icon"));
        assert_eq!(sniff(br#"<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>"#), Some("image/svg+xml"));
        assert_eq!(sniff(b"<!doctype html><html><body>Forbidden</body></html>"), None);
    }
}
