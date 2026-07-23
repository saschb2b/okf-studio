use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;

const IGNORE_FILE: &str = ".okfignore";
const MAX_IGNORE_BYTES: u64 = 64 * 1024;
const MAX_RULES: usize = 512;
const MAX_PATTERN_CHARS: usize = 512;
const MAX_REPORT_PATHS: usize = 128;
const DEFAULT_IGNORED_DIRS: [&str; 6] =
    [".git", "node_modules", "target", "dist", "build", ".venv"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaseBehavior {
    Sensitive,
    Insensitive,
}

#[derive(Debug, Clone)]
struct IgnoreRule {
    authored: String,
    negated: bool,
    directory_only: bool,
    pattern: Regex,
    descendant_pattern: Regex,
}

#[derive(Debug, Clone)]
pub struct IgnoreMatcher {
    root: PathBuf,
    rules: Vec<IgnoreRule>,
    diagnostics: Vec<String>,
    source_present: bool,
    case_behavior: CaseBehavior,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreReport {
    pub schema_version: u32,
    pub source: Option<String>,
    pub rule_count: usize,
    pub case_sensitive: bool,
    pub excluded_count: usize,
    pub excluded_paths: Vec<String>,
    pub diagnostics: Vec<String>,
    pub truncated: bool,
}

impl IgnoreMatcher {
    pub fn load(root: &Path) -> Self {
        Self::load_with_case(
            root,
            if cfg!(windows) {
                CaseBehavior::Insensitive
            } else {
                CaseBehavior::Sensitive
            },
        )
    }

    pub fn load_with_case(root: &Path, case_behavior: CaseBehavior) -> Self {
        let path = root.join(IGNORE_FILE);
        let mut diagnostics = Vec::new();
        let source_present = path.is_file();
        let source = if source_present {
            match fs::metadata(&path) {
                Ok(metadata) if metadata.len() <= MAX_IGNORE_BYTES => {
                    fs::read_to_string(&path).ok()
                }
                Ok(_) => {
                    diagnostics.push(
                        ".okfignore exceeds the 64 KiB rule-file limit and was not applied."
                            .to_string(),
                    );
                    None
                }
                Err(_) => None,
            }
        } else {
            None
        };
        let mut rules = Vec::new();
        if let Some(source) = source {
            for (index, line) in source.lines().enumerate() {
                if rules.len() >= MAX_RULES {
                    diagnostics.push(format!(
                        ".okfignore has more than {MAX_RULES} rules; later rules were preserved but not applied."
                    ));
                    break;
                }
                match parse_rule(line, case_behavior) {
                    Ok(Some(rule)) => rules.push(rule),
                    Ok(None) => {}
                    Err(message) => {
                        diagnostics.push(format!(".okfignore line {}: {message}", index + 1))
                    }
                }
            }
        }
        Self {
            root: root.to_path_buf(),
            rules,
            diagnostics,
            source_present,
            case_behavior,
        }
    }

    pub fn is_ignored(&self, path: &Path, is_directory: bool) -> bool {
        let Some(relative) = portable_relative(&self.root, path) else {
            return true;
        };
        if relative.is_empty() {
            return false;
        }
        if default_ignored(&relative) {
            return true;
        }
        let mut ignored = false;
        for rule in &self.rules {
            let matches = if rule.directory_only && !is_directory {
                rule.descendant_pattern.is_match(&relative)
            } else {
                rule.pattern.is_match(&relative)
            };
            if !matches {
                continue;
            }
            ignored = !rule.negated;
        }
        ignored
    }

    pub fn source_present(&self) -> bool {
        self.source_present
    }

    pub fn rule_count(&self) -> usize {
        self.rules.len()
    }

    pub fn diagnostics(&self) -> &[String] {
        &self.diagnostics
    }

    pub fn authored_rules(&self) -> impl Iterator<Item = &str> {
        self.rules.iter().map(|rule| rule.authored.as_str())
    }
}

pub fn analyze(root: &Path) -> IgnoreReport {
    let matcher = IgnoreMatcher::load(root);
    let mut excluded_count = 0_usize;
    let mut excluded_paths = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.path() != root)
    {
        if matcher.is_ignored(entry.path(), entry.file_type().is_dir()) {
            excluded_count += 1;
            if excluded_paths.len() < MAX_REPORT_PATHS {
                if let Some(relative) = portable_relative(root, entry.path()) {
                    excluded_paths.push(relative);
                }
            }
        }
    }
    excluded_paths.sort();
    IgnoreReport {
        schema_version: 1,
        source: matcher.source_present().then(|| IGNORE_FILE.to_string()),
        rule_count: matcher.rule_count(),
        case_sensitive: matcher.case_behavior == CaseBehavior::Sensitive,
        excluded_count,
        excluded_paths,
        diagnostics: matcher.diagnostics().to_vec(),
        truncated: excluded_count > MAX_REPORT_PATHS,
    }
}

fn parse_rule(line: &str, case_behavior: CaseBehavior) -> Result<Option<IgnoreRule>, String> {
    let mut value = line.trim();
    if value.is_empty() || value.starts_with('#') {
        return Ok(None);
    }
    let escaped_marker = value.starts_with("\\#") || value.starts_with("\\!");
    if escaped_marker {
        value = &value[1..];
    }
    let negated = !escaped_marker && value.starts_with('!');
    if negated {
        value = &value[1..];
    }
    let value = value.trim();
    if value.is_empty() {
        return Err("a negation must name a pattern.".to_string());
    }
    if value.chars().count() > MAX_PATTERN_CHARS || value.chars().any(char::is_control) {
        return Err(
            "the pattern is empty, contains controls, or exceeds 512 characters.".to_string(),
        );
    }
    let normalized = value.replace('\\', "/");
    if Path::new(&normalized).components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("patterns must stay relative to the bundle root.".to_string());
    }
    let directory_only = normalized.ends_with('/');
    let authored = format!("{}{}", if negated { "!" } else { "" }, normalized);
    let pattern = compile_pattern(
        normalized.trim_start_matches('/').trim_end_matches('/'),
        normalized.starts_with('/'),
        case_behavior,
        false,
    )?;
    let descendant_pattern = compile_pattern(
        normalized.trim_start_matches('/').trim_end_matches('/'),
        normalized.starts_with('/'),
        case_behavior,
        true,
    )?;
    Ok(Some(IgnoreRule {
        authored,
        negated,
        directory_only,
        pattern,
        descendant_pattern,
    }))
}

fn compile_pattern(
    pattern: &str,
    anchored: bool,
    case_behavior: CaseBehavior,
    descendants_only: bool,
) -> Result<Regex, String> {
    if pattern.is_empty() {
        return Err("the pattern must name a path.".to_string());
    }
    let has_slash = pattern.contains('/');
    let mut regex = String::new();
    if case_behavior == CaseBehavior::Insensitive {
        regex.push_str("(?i)");
    }
    if anchored || has_slash {
        regex.push('^');
    } else {
        regex.push_str("(?:^|/)");
    }
    let mut characters = pattern.chars().peekable();
    while let Some(character) = characters.next() {
        match character {
            '*' if characters.peek() == Some(&'*') => {
                characters.next();
                if characters.peek() == Some(&'/') {
                    characters.next();
                    regex.push_str("(?:.*/)?");
                } else {
                    regex.push_str(".*");
                }
            }
            '*' => regex.push_str("[^/]*"),
            '?' => regex.push_str("[^/]"),
            '/' => regex.push('/'),
            other => regex.push_str(&regex::escape(&other.to_string())),
        }
    }
    if descendants_only {
        regex.push_str("/.*$");
    } else {
        regex.push_str("(?:/.*)?$");
    }
    Regex::new(&regex).map_err(|_| "the pattern could not be compiled.".to_string())
}

fn portable_relative(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let mut parts = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(value) => parts.push(value.to_string_lossy().to_string()),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(parts.join("/"))
}

fn default_ignored(relative: &str) -> bool {
    relative.split('/').any(|segment| {
        DEFAULT_IGNORED_DIRS.contains(&segment)
            || (segment.starts_with('.') && segment.len() > 1 && segment != IGNORE_FILE)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempRoot(PathBuf);

    impl TempRoot {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let root = std::env::temp_dir().join(format!("okf-ignore-{nonce}"));
            fs::create_dir_all(&root).expect("temp root");
            Self(root)
        }
    }

    impl Drop for TempRoot {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn applies_nested_globs_and_last_matching_negation() {
        let root = TempRoot::new();
        fs::write(
            root.0.join(IGNORE_FILE),
            "private/**\n!private/public.md\n*.generated.md\n",
        )
        .expect("ignore");
        let matcher = IgnoreMatcher::load_with_case(&root.0, CaseBehavior::Sensitive);

        assert!(matcher.is_ignored(&root.0.join("private/secret.md"), false));
        assert!(!matcher.is_ignored(&root.0.join("private/public.md"), false));
        assert!(matcher.is_ignored(&root.0.join("nested/cache.generated.md"), false));
        assert!(!matcher.is_ignored(&root.0.join("nested/cache.md"), false));
    }

    #[test]
    fn pins_case_behavior_and_never_follows_or_includes_default_noise() {
        let root = TempRoot::new();
        fs::write(root.0.join(IGNORE_FILE), "Private/**\n").expect("ignore");
        let sensitive = IgnoreMatcher::load_with_case(&root.0, CaseBehavior::Sensitive);
        let insensitive = IgnoreMatcher::load_with_case(&root.0, CaseBehavior::Insensitive);
        assert!(!sensitive.is_ignored(&root.0.join("private/a.md"), false));
        assert!(insensitive.is_ignored(&root.0.join("private/a.md"), false));
        assert!(sensitive.is_ignored(&root.0.join(".git/config"), false));
        assert!(sensitive.is_ignored(&root.0.join(".hidden/a.md"), false));
    }

    #[cfg(unix)]
    #[test]
    fn reports_a_symlink_without_following_its_target() {
        use std::os::unix::fs::symlink;
        let root = TempRoot::new();
        let outside = TempRoot::new();
        fs::write(outside.0.join("secret.md"), "secret").expect("outside");
        symlink(&outside.0, root.0.join("linked")).expect("symlink");
        fs::write(root.0.join(IGNORE_FILE), "linked\n").expect("ignore");

        let report = analyze(&root.0);
        assert_eq!(report.excluded_paths, ["linked"]);
        assert_eq!(report.excluded_count, 1);
    }
}
