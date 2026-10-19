//! Built-in classification of apps and websites.
//!
//! Every recorded span carries a category and a productivity score
//! (1 = productive, 0 = neutral, -1 = distracting). Users can override either
//! per app or per site; overrides live in the `rules` table and win over the
//! defaults below.

pub const CATEGORIES: &[(&str, i8)] = &[
    ("development", 1),
    ("design", 1),
    ("writing", 1),
    ("productivity", 1),
    ("learning", 1),
    ("communication", 0),
    ("meetings", 0),
    ("browsing", 0),
    ("utilities", 0),
    ("other", 0),
    ("social", -1),
    ("entertainment", -1),
    ("news", -1),
    ("shopping", -1),
    ("games", -1),
];

pub fn default_productivity(category: &str) -> i8 {
    CATEGORIES
        .iter()
        .find(|(c, _)| *c == category)
        .map(|(_, p)| *p)
        .unwrap_or(0)
}

pub fn is_valid_category(category: &str) -> bool {
    CATEGORIES.iter().any(|(c, _)| *c == category)
}

/// Keyword rules matched against the lower-cased app id and display name.
/// A leading `=` means the whole name must match (for short or ambiguous words).
const APP_RULES: &[(&str, &[&str])] = &[
    (
        "development",
        &[
            "visual studio code", "=code", "=code - insiders", "cursor", "windsurf", "xcode",
            "android studio", "intellij", "idea64", "pycharm", "webstorm", "goland", "rider",
            "clion", "rubymine", "phpstorm", "datagrip", "=fleet", "=zed", "sublime text",
            "sublime_text", "=vim", "neovim", "=nvim", "emacs", "=terminal", "iterm", "=warp",
            "alacritty", "=kitty", "wezterm", "=hyper", "ghostty", "windowsterminal",
            "windows terminal", "powershell", "=pwsh", "=cmd", "command prompt", "postman",
            "insomnia", "docker", "github desktop", "githubdesktop", "sourcetree", "=tower",
            "=fork", "gitkraken", "tableplus", "dbeaver", "sequel ace", "simulator", "devenv",
            "visual studio", "eclipse", "netbeans", "jupyter", "rstudio", "matlab", "=unity",
            "unreal", "godot", "=nova", "=bbedit", "lapce", "helix", "=termux", "gnome-terminal",
            "konsole", "=xterm", "tilix", "=foot", "proxyman", "charles", "wireshark",
            "dev.warp", "com.termux",
        ],
    ),
    (
        "design",
        &[
            "figma", "=sketch", "photoshop", "illustrator", "indesign", "after effects",
            "afterfx", "premiere", "lightroom", "affinity", "pixelmator", "procreate", "blender",
            "cinema 4d", "=framer", "=canva", "davinci", "resolve", "final cut", "logic pro",
            "ableton", "fl studio", "fl64", "=spline", "=rive", "principle", "zeplin", "krita",
            "=gimp", "inkscape", "capcut", "lumafusion", "=motion", "=darktable", "photopea",
        ],
    ),
    (
        "writing",
        &[
            "microsoft word", "winword", "=pages", "ulysses", "ia writer", "scrivener", "=bear",
            "typora", "libreoffice writer", "=soffice", "grammarly", "=drafts", "=word",
            "google docs", "manuscripts", "hemingway",
        ],
    ),
    (
        "productivity",
        &[
            "notion", "obsidian", "evernote", "onenote", "=things", "=things 3", "todoist",
            "omnifocus", "ticktick", "reminders", "=notes", "=calendar", "fantastical",
            "microsoft excel", "=excel", "=numbers", "keynote", "powerpoint", "powerpnt",
            "airtable", "=craft", "logseq", "=linear", "=jira", "asana", "trello", "clickup",
            "=monday", "basecamp", "chatgpt", "=claude", "kairo", "=akiflow", "sunsama",
            "=amie", "=cron", "notion calendar", "=superlist", "=anytype", "=heptabase",
            "=tana", "=miro", "=whimsical", "google keep", "microsoft to do", "=outlook calendar",
            "=perplexity", "=gemini", "=copilot", "=acrobat", "acrord32", "adobe acrobat",
            "=preview", "pdf expert", "skim",
        ],
    ),
    (
        "learning",
        &[
            "=anki", "ankidroid", "kindle", "=books", "apple books", "duolingo", "coursera",
            "khan academy", "udemy", "skillshare", "readwise", "=reader", "brilliant",
            "=libby", "=audible", "=blinkist", "=mimo", "sololearn", "=quizlet",
        ],
    ),
    (
        "communication",
        &[
            "=slack", "microsoft teams", "=teams", "ms-teams", "discord", "=mail", "=outlook",
            "=spark", "airmail", "thunderbird", "mimestream", "superhuman", "=messages",
            "whatsapp", "telegram", "=signal", "messenger", "skype", "wechat", "=line",
            "=gmail", "=hey", "=missive", "=front", "=beeper", "=element", "=viber",
            "com.google.android.gm", "com.whatsapp", "org.telegram", "com.slack",
            "com.microsoft.teams", "com.discord",
        ],
    ),
    (
        "meetings",
        &[
            "zoom", "facetime", "webex", "google meet", "=around", "=tuple", "=loom",
            "=gather", "=gotomeeting", "=jitsi", "us.zoom.videomeetings",
        ],
    ),
    (
        "social",
        &[
            "twitter", "=x", "facebook", "instagram", "linkedin", "reddit", "tiktok",
            "pinterest", "tumblr", "=threads", "bluesky", "mastodon", "snapchat", "tweetbot",
            "=ivory", "=apollo", "=quora", "=9gag", "com.zhiliaoapp.musically",
            "com.ss.android.ugc", "com.instagram", "com.facebook", "com.twitter",
            "com.reddit", "com.snapchat", "com.pinterest", "com.linkedin",
        ],
    ),
    (
        "entertainment",
        &[
            "youtube", "netflix", "prime video", "disney+", "disney plus", "=hbo", "=max",
            "=hulu", "twitch", "spotify", "=music", "apple music", "=tv", "apple tv", "=vlc",
            "=iina", "=plex", "crunchyroll", "infuse", "=mpv", "=kodi", "soundcloud",
            "com.google.android.youtube", "com.netflix", "com.spotify", "tv.twitch",
            "com.disney", "com.amazon.avod",
        ],
    ),
    (
        "news",
        &[
            "=news", "apple news", "=reeder", "netnewswire", "feedly", "flipboard",
            "google news", "com.google.android.apps.magazines",
        ],
    ),
    (
        "shopping",
        &[
            "=amazon", "amazon shopping", "=ebay", "aliexpress", "=etsy", "=temu", "=shein",
            "=daraz", "=walmart", "com.amazon.mshop",
        ],
    ),
    (
        "games",
        &[
            "=steam", "steamwebhelper", "epic games", "battle.net", "minecraft",
            "league of legends", "valorant", "roblox", "=chess", "solitaire", "candy crush",
            "genshin", "=fortnite", "clash of clans", "clash royale", "pubg", "=among us",
            "com.supercell", "com.king", "com.mojang", "com.roblox",
        ],
    ),
    (
        "utilities",
        &[
            "=finder", "=explorer", "windows explorer", "file explorer", "system settings",
            "system preferences", "=settings", "control panel", "task manager", "taskmgr",
            "activity monitor", "1password", "bitwarden", "raycast", "=alfred", "spotlight",
            "=photos", "app store", "microsoft store", "calculator", "=clock", "cleanshot",
            "loginwindow", "=dock", "=launcher", "lockapp", "screenshot", "snipping tool",
            "snippingtool", "nautilus", "=dolphin", "=files", "=archive utility", "keychain",
            "=installer", "applicationframehost", "searchhost", "shellexperiencehost",
            "com.android.settings", "com.google.android.apps.photos", "com.android.vending",
        ],
    ),
    (
        "browsing",
        &[
            "google chrome", "=chrome", "=safari", "firefox", "microsoft edge", "=msedge",
            "=brave", "brave browser", "=arc", "=opera", "vivaldi", "chromium", "=zen",
            "zen browser", "=orion", "=dia", "librewolf", "waterfox", "=floorp", "=sidekick",
            "com.android.chrome", "org.mozilla", "com.brave.browser", "com.opera",
            "com.microsoft.emmx", "com.sec.android.app.sbrowser",
        ],
    ),
];

/// Domain rules: a domain matches if it equals or ends with `.{rule}`.
const DOMAIN_RULES: &[(&str, &[&str])] = &[
    (
        "development",
        &[
            "github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com",
            "stackexchange.com", "developer.mozilla.org", "vercel.com", "netlify.com",
            "localhost", "127.0.0.1", "codepen.io", "codesandbox.io", "replit.com",
            "npmjs.com", "crates.io", "pypi.org", "docs.rs", "aws.amazon.com",
            "console.cloud.google.com", "portal.azure.com", "readthedocs.io", "huggingface.co",
            "sentry.io", "railway.app", "render.com", "supabase.com", "firebase.google.com",
            "dash.cloudflare.com", "hub.docker.com", "kaggle.com", "leetcode.com",
            "developer.apple.com", "developer.android.com", "learn.microsoft.com",
            "tauri.app", "react.dev", "rust-lang.org", "python.org", "go.dev",
        ],
    ),
    (
        "design",
        &[
            "figma.com", "canva.com", "dribbble.com", "behance.net", "framer.com",
            "spline.design", "coolors.co", "fonts.google.com", "unsplash.com", "mobbin.com",
            "photopea.com", "excalidraw.com",
        ],
    ),
    (
        "writing",
        &[
            "docs.google.com", "overleaf.com", "grammarly.com", "hemingwayapp.com",
            "quillbot.com",
        ],
    ),
    (
        "productivity",
        &[
            "notion.so", "notion.site", "calendar.google.com", "sheets.google.com",
            "slides.google.com", "drive.google.com", "keep.google.com", "airtable.com",
            "todoist.com", "trello.com", "asana.com", "atlassian.net", "linear.app",
            "clickup.com", "monday.com", "chatgpt.com", "chat.openai.com", "claude.ai",
            "gemini.google.com", "perplexity.ai", "miro.com", "whimsical.com",
            "office.com", "sharepoint.com", "onedrive.live.com", "dropbox.com", "box.com",
            "copilot.microsoft.com",
        ],
    ),
    (
        "learning",
        &[
            "coursera.org", "udemy.com", "khanacademy.org", "edx.org", "wikipedia.org",
            "duolingo.com", "brilliant.org", "skillshare.com", "pluralsight.com", "egghead.io",
            "frontendmasters.com", "freecodecamp.org", "arxiv.org", "scholar.google.com",
            "w3schools.com", "codecademy.com", "masterclass.com", "ocw.mit.edu",
        ],
    ),
    (
        "communication",
        &[
            "mail.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com",
            "app.slack.com", "slack.com", "teams.microsoft.com", "discord.com",
            "web.whatsapp.com", "web.telegram.org", "messenger.com", "mail.proton.me",
            "app.hey.com", "fastmail.com",
        ],
    ),
    (
        "meetings",
        &["meet.google.com", "zoom.us", "webex.com", "whereby.com", "loom.com"],
    ),
    (
        "social",
        &[
            "twitter.com", "x.com", "facebook.com", "instagram.com", "reddit.com",
            "tiktok.com", "pinterest.com", "tumblr.com", "threads.net", "threads.com",
            "bsky.app", "linkedin.com", "quora.com", "9gag.com", "mastodon.social",
            "snapchat.com", "vk.com",
        ],
    ),
    (
        "entertainment",
        &[
            "youtube.com", "youtu.be", "netflix.com", "primevideo.com", "disneyplus.com",
            "max.com", "hbomax.com", "hulu.com", "twitch.tv", "open.spotify.com",
            "music.youtube.com", "soundcloud.com", "crunchyroll.com", "vimeo.com", "imdb.com",
            "music.apple.com", "tv.apple.com", "kick.com", "dailymotion.com",
        ],
    ),
    (
        "news",
        &[
            "cnn.com", "bbc.com", "bbc.co.uk", "nytimes.com", "theguardian.com",
            "washingtonpost.com", "bloomberg.com", "reuters.com", "apnews.com", "foxnews.com",
            "news.google.com", "news.ycombinator.com", "theverge.com", "techcrunch.com",
            "wired.com", "arstechnica.com", "espn.com", "news.yahoo.com", "aljazeera.com",
            "wsj.com", "ft.com", "economist.com", "buzzfeed.com", "huffpost.com",
            "prothomalo.com", "thedailystar.net",
        ],
    ),
    (
        "shopping",
        &[
            "amazon.com", "amazon.co.uk", "amazon.de", "amazon.in", "ebay.com",
            "aliexpress.com", "etsy.com", "walmart.com", "target.com", "bestbuy.com",
            "temu.com", "shein.com", "daraz.com.bd", "daraz.pk", "flipkart.com",
            "alibaba.com", "ikea.com", "zara.com",
        ],
    ),
    (
        "games",
        &[
            "chess.com", "lichess.org", "roblox.com", "store.steampowered.com",
            "steamcommunity.com", "poki.com", "miniclip.com", "crazygames.com", "itch.io",
            "epicgames.com",
        ],
    ),
    (
        "browsing",
        &["google.com", "bing.com", "duckduckgo.com", "search.brave.com", "ecosia.org", "kagi.com"],
    ),
];

fn matches_keyword(rule: &str, app_id: &str, name: &str) -> bool {
    if let Some(exact) = rule.strip_prefix('=') {
        app_id == exact || name == exact
    } else {
        app_id.contains(rule) || name.contains(rule)
    }
}

pub fn domain_matches(domain: &str, rule: &str) -> bool {
    domain == rule
        || (domain.len() > rule.len()
            && domain.ends_with(rule)
            && domain.as_bytes()[domain.len() - rule.len() - 1] == b'.')
}

pub fn classify_domain(domain: &str) -> Option<&'static str> {
    let domain = domain.to_ascii_lowercase();
    // Longer rules first so "music.youtube.com" beats "youtube.com" style overlaps.
    let mut best: Option<(&'static str, usize)> = None;
    for (category, rules) in DOMAIN_RULES {
        for rule in *rules {
            if domain_matches(&domain, rule) && best.map_or(true, |(_, len)| rule.len() > len) {
                best = Some((category, rule.len()));
            }
        }
    }
    best.map(|(c, _)| c)
}

pub fn classify_app(app_id: &str, app_name: &str) -> &'static str {
    let id = app_id.to_lowercase();
    let name = app_name.to_lowercase();
    for (category, rules) in APP_RULES {
        if rules.iter().any(|r| matches_keyword(r, &id, &name)) {
            return category;
        }
    }
    "other"
}

#[cfg(desktop)]
pub fn is_browser(app_id: &str, app_name: &str) -> bool {
    let id = app_id.to_lowercase();
    let name = app_name.to_lowercase();
    APP_RULES
        .iter()
        .find(|(c, _)| *c == "browsing")
        .map(|(_, rules)| rules.iter().any(|r| matches_keyword(r, &id, &name)))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_common_apps() {
        assert_eq!(classify_app("visual studio code", "Code"), "development");
        assert_eq!(classify_app("code", "Visual Studio Code"), "development");
        assert_eq!(classify_app("slack", "Slack"), "communication");
        assert_eq!(classify_app("steam", "Steam"), "games");
        assert_eq!(classify_app("ms-teams", "Microsoft Teams"), "communication");
        assert_eq!(classify_app("com.instagram.android", "Instagram"), "social");
        assert_eq!(classify_app("google chrome", "Google Chrome"), "browsing");
        assert_eq!(classify_app("3ds max", "3ds Max"), "other");
        assert!(is_browser("msedge", "Microsoft Edge"));
        assert!(!is_browser("figma", "Figma"));
    }

    #[test]
    fn classifies_domains() {
        assert_eq!(classify_domain("www.youtube.com"), Some("entertainment"));
        assert_eq!(classify_domain("music.youtube.com"), Some("entertainment"));
        assert_eq!(classify_domain("docs.google.com"), Some("writing"));
        assert_eq!(classify_domain("google.com"), Some("browsing"));
        assert_eq!(classify_domain("x.com"), Some("social"));
        assert_eq!(classify_domain("box.com"), Some("productivity"));
        assert_eq!(classify_domain("dropbox.com"), Some("productivity"));
        assert_eq!(classify_domain("netbox.company"), None);
        assert_eq!(classify_domain("example.org"), None);
    }
}
