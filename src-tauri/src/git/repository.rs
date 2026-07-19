//! Typed Git operations for the repository containing the active bundle.
//!
//! Git runs as a fixed executable with fixed arguments, never through a shell.
//! The caller authorizes both the bundle and its containing folder grant before
//! discovery. DTOs expose repository-relative paths and display metadata only.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Output};

const MAX_COMMAND_OUTPUT: usize = 2 * 1024 * 1024;
const MAX_DIFF_CHARS: usize = 512 * 1024;
const MAX_HISTORY_PAGE: usize = 100;
const MAX_PATHS_PER_ACTION: usize = 512;
const MAX_COMMIT_MESSAGE_CHARS: usize = 16 * 1024;
const REPOSITORY_SCOPE_DENIED: &str =
    "The bundle is inside a larger Git repository. Allow that repository to use Git here.";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitAvailability {
    Ready,
    NotRepository,
    GitUnavailable,
    ScopeDenied,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitChangeKind {
    Conflict,
    Modified,
    Added,
    Deleted,
    Renamed,
    Untracked,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub path: String,
    pub kind: GitChangeKind,
    pub staged: bool,
    pub unstaged: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepositorySnapshot {
    pub availability: GitAvailability,
    pub message: Option<String>,
    pub repository_name: Option<String>,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub head_sha: Option<String>,
    pub changes: Vec<GitChange>,
}

impl GitRepositorySnapshot {
    fn unavailable(availability: GitAvailability, message: impl Into<String>) -> Self {
        Self {
            availability,
            message: Some(message.into()),
            repository_name: None,
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            head_sha: None,
            changes: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHistoryPage {
    pub commits: Vec<GitCommit>,
    pub has_more: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    pub title: String,
    pub text: String,
    pub truncated: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GitRemoteOperation {
    Fetch,
    Pull,
    Push,
}

#[derive(Clone, Debug)]
pub struct RepositoryScope {
    root: PathBuf,
    metadata_roots: Vec<PathBuf>,
}

pub fn snapshot(
    bundle_root: &Path,
    folder_grants: &[PathBuf],
) -> Result<GitRepositorySnapshot, String> {
    if !git_is_available() {
        return Ok(GitRepositorySnapshot::unavailable(
            GitAvailability::GitUnavailable,
            "Install Git and restart Studio to use repository tools.",
        ));
    }
    let scope = match discover(bundle_root, folder_grants) {
        Ok(Some(scope)) => scope,
        Ok(None) => {
            return Ok(GitRepositorySnapshot::unavailable(
                GitAvailability::NotRepository,
                "The active bundle is not inside a Git repository.",
            ));
        }
        Err(error) if error == REPOSITORY_SCOPE_DENIED => {
            return Ok(GitRepositorySnapshot::unavailable(
                GitAvailability::ScopeDenied,
                error,
            ));
        }
        Err(error) => return Err(error),
    };
    scope.snapshot()
}

pub fn discover(
    bundle_root: &Path,
    folder_grants: &[PathBuf],
) -> Result<Option<RepositoryScope>, String> {
    let Some(root) = enclosing_root(bundle_root)? else {
        return Ok(None);
    };
    let folder_grant = folder_grants
        .iter()
        .filter_map(|grant| dunce::canonicalize(grant).ok())
        .filter(|grant| root == *grant || root.starts_with(grant))
        .max_by_key(|grant| grant.components().count())
        .ok_or_else(|| REPOSITORY_SCOPE_DENIED.to_string())?;
    let metadata_roots = discover_metadata_roots(&root, &folder_grant);
    Ok(Some(RepositoryScope {
        root,
        metadata_roots,
    }))
}

pub fn enclosing_root(bundle_root: &Path) -> Result<Option<PathBuf>, String> {
    if !git_is_available() {
        return Err("Git is not installed or is not available on PATH.".to_string());
    }
    let output = base_command(bundle_root)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .map_err(|_| "Git is not installed or is not available on PATH.".to_string())?;
    if !output.status.success() {
        return Ok(None);
    }
    let root_text = bounded_utf8(&output.stdout, "Git repository root")?;
    let root = dunce::canonicalize(root_text.trim())
        .map_err(|_| "The Git repository root is no longer available.".to_string())?;
    Ok(Some(root))
}

impl RepositoryScope {
    pub fn watch_roots(&self) -> (PathBuf, Vec<PathBuf>) {
        (self.root.clone(), self.metadata_roots.clone())
    }

    pub fn snapshot(&self) -> Result<GitRepositorySnapshot, String> {
        let branch =
            optional_git_text(&self.root, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
        let head_sha = optional_git_text(&self.root, &["rev-parse", "HEAD"])?;
        let upstream = optional_git_text(
            &self.root,
            &[
                "rev-parse",
                "--abbrev-ref",
                "--symbolic-full-name",
                "@{upstream}",
            ],
        )?;
        let (ahead, behind) = if upstream.is_some() && head_sha.is_some() {
            optional_git_text(
                &self.root,
                &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
            )?
            .and_then(|text| parse_ahead_behind(&text))
            .unwrap_or_default()
        } else {
            (0, 0)
        };
        let status = run_git(
            &self.root,
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
            false,
        )?;
        let changes = parse_porcelain_v1(&status)?;
        let repository_name = self
            .root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Repository")
            .to_string();
        Ok(GitRepositorySnapshot {
            availability: GitAvailability::Ready,
            message: None,
            repository_name: Some(repository_name),
            branch: branch.or_else(|| head_sha.as_ref().map(|sha| short_sha(sha))),
            upstream,
            ahead,
            behind,
            head_sha,
            changes,
        })
    }

    pub fn history(&self, skip: usize, limit: usize) -> Result<GitHistoryPage, String> {
        let limit = limit.clamp(1, MAX_HISTORY_PAGE);
        let requested = limit + 1;
        let output = run_git_owned(
            &self.root,
            vec![
                "log".into(),
                format!("--skip={skip}"),
                format!("-n{requested}"),
                "--date-order".into(),
                "--format=%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%s%x1e".into(),
            ],
            false,
        );
        let output = match output {
            Ok(output) => output,
            Err(_error) if self.snapshot()?.head_sha.is_none() => String::new(),
            Err(error) => return Err(error),
        };
        let mut commits = parse_history(&output)?;
        let has_more = commits.len() > limit;
        commits.truncate(limit);
        Ok(GitHistoryPage { commits, has_more })
    }

    pub fn diff(
        &self,
        path: Option<&str>,
        staged: bool,
        commit: Option<&str>,
    ) -> Result<GitDiff, String> {
        let path = path.map(validate_relative_path).transpose()?;
        if commit.is_none() && !staged {
            if let Some(path) = path {
                let snapshot = self.snapshot()?;
                if snapshot
                    .changes
                    .iter()
                    .any(|change| change.path == path && change.kind == GitChangeKind::Untracked)
                {
                    return self.untracked_diff(path);
                }
            }
        }
        let mut args = if let Some(commit) = commit {
            validate_revision(commit)?;
            vec![
                "show".to_string(),
                "--format=".to_string(),
                "--no-ext-diff".to_string(),
                "--no-renames".to_string(),
                "--unified=3".to_string(),
                commit.to_string(),
            ]
        } else {
            let mut args = vec![
                "diff".to_string(),
                "--no-ext-diff".to_string(),
                "--unified=3".to_string(),
            ];
            if staged {
                args.push("--cached".to_string());
            }
            args
        };
        if let Some(path) = path {
            args.push("--".to_string());
            args.push(path.to_string());
        }
        let output = run_git_owned(&self.root, args, false)?;
        let (text, truncated) = truncate_chars(output, MAX_DIFF_CHARS);
        let title = match (commit, path, staged) {
            (Some(sha), Some(path), _) => format!("{} at {}", path, short_sha(sha)),
            (Some(sha), None, _) => format!("Commit {}", short_sha(sha)),
            (None, Some(path), true) => format!("Staged changes in {path}"),
            (None, Some(path), false) => format!("Changes in {path}"),
            (None, None, true) => "Staged changes".to_string(),
            (None, None, false) => "Working tree changes".to_string(),
        };
        Ok(GitDiff {
            title,
            text,
            truncated,
        })
    }

    fn untracked_diff(&self, path: &str) -> Result<GitDiff, String> {
        let target = dunce::canonicalize(self.root.join(path))
            .map_err(|_| "The changed file is no longer available.".to_string())?;
        if target == self.root || !target.starts_with(&self.root) {
            return Err("The changed file resolves outside the authorized repository.".to_string());
        }
        let metadata = fs::metadata(&target)
            .map_err(|_| "The changed file is no longer available.".to_string())?;
        if !metadata.is_file() {
            return Err("Only regular files can be shown in a Git diff.".to_string());
        }
        if metadata.len() > MAX_DIFF_CHARS as u64 {
            return Ok(GitDiff {
                title: format!("Untracked file {path}"),
                text: "This untracked file is too large to preview in Studio.".to_string(),
                truncated: true,
            });
        }
        let bytes = fs::read(&target)
            .map_err(|_| "The changed file could not be read for its diff.".to_string())?;
        if bytes.contains(&0) {
            return Ok(GitDiff {
                title: format!("Untracked file {path}"),
                text: "Binary file content is not shown.".to_string(),
                truncated: false,
            });
        }
        let contents = String::from_utf8(bytes).map_err(|_| {
            "The changed file is not valid UTF-8 and cannot be previewed.".to_string()
        })?;
        let line_count = contents.lines().count();
        let mut text = format!(
            "diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n@@ -0,0 +1,{line_count} @@\n"
        );
        for line in contents.split_inclusive('\n') {
            text.push('+');
            text.push_str(line);
        }
        if !contents.is_empty() && !contents.ends_with('\n') {
            text.push_str("\n\\ No newline at end of file\n");
        }
        let (text, truncated) = truncate_chars(text, MAX_DIFF_CHARS);
        Ok(GitDiff {
            title: format!("Untracked file {path}"),
            text,
            truncated,
        })
    }

    pub fn stage(&self, paths: &[String]) -> Result<(), String> {
        let paths = validate_paths(paths)?;
        let mut args = vec!["add".to_string(), "-A".to_string(), "--".to_string()];
        args.extend(paths);
        run_git_owned(&self.root, args, false).map(|_| ())
    }

    pub fn unstage(&self, paths: &[String]) -> Result<(), String> {
        let paths = validate_paths(paths)?;
        let mut args = if self.snapshot()?.head_sha.is_some() {
            vec![
                "reset".to_string(),
                "-q".to_string(),
                "HEAD".to_string(),
                "--".to_string(),
            ]
        } else {
            vec![
                "rm".to_string(),
                "--cached".to_string(),
                "-r".to_string(),
                "--".to_string(),
            ]
        };
        args.extend(paths);
        run_git_owned(&self.root, args, false).map(|_| ())
    }

    pub fn stage_all(&self) -> Result<(), String> {
        run_git(&self.root, &["add", "-A"], false).map(|_| ())
    }

    pub fn unstage_all(&self) -> Result<(), String> {
        if self.snapshot()?.head_sha.is_some() {
            run_git(&self.root, &["reset", "-q", "HEAD"], false).map(|_| ())
        } else {
            run_git(
                &self.root,
                &["rm", "--cached", "-r", "--ignore-unmatch", "."],
                false,
            )
            .map(|_| ())
        }
    }

    pub fn commit(&self, message: &str, include_tracked: bool) -> Result<String, String> {
        let message = message.trim();
        if message.is_empty() {
            return Err("Enter a commit message first.".to_string());
        }
        if message.chars().count() > MAX_COMMIT_MESSAGE_CHARS {
            return Err(format!(
                "Commit messages are limited to {MAX_COMMIT_MESSAGE_CHARS} characters."
            ));
        }
        let snapshot = self.snapshot()?;
        if snapshot
            .changes
            .iter()
            .any(|change| change.kind == GitChangeKind::Conflict && change.unstaged)
        {
            return Err(
                "Resolve conflicted files in an editor or terminal, then stage them before committing."
                    .to_string(),
            );
        }
        if include_tracked {
            run_git(&self.root, &["add", "-u"], false)?;
        }
        run_git_owned(
            &self.root,
            vec![
                "commit".into(),
                "--no-verify".into(),
                "--message".into(),
                message.to_string(),
            ],
            false,
        )?;
        optional_git_text(&self.root, &["rev-parse", "HEAD"])?.ok_or_else(|| {
            "Git committed the changes but did not report a new revision.".to_string()
        })
    }

    pub fn undo_commit(&self, expected_head: &str) -> Result<(), String> {
        validate_revision(expected_head)?;
        let head = optional_git_text(&self.root, &["rev-parse", "HEAD"])?
            .ok_or_else(|| "There is no commit to undo.".to_string())?;
        if head != expected_head {
            return Err(
                "The repository moved after that commit. Refresh before choosing another recovery action."
                    .to_string(),
            );
        }
        run_git(&self.root, &["reset", "--soft", "HEAD^"], false).map(|_| ())
    }

    pub fn remote(&self, operation: GitRemoteOperation) -> Result<(), String> {
        let args: &[&str] = match operation {
            GitRemoteOperation::Fetch => &["fetch", "--prune"],
            GitRemoteOperation::Pull => &["pull", "--ff-only"],
            GitRemoteOperation::Push => &["push"],
        };
        run_git(&self.root, args, false).map(|_| ())
    }
}

fn discover_metadata_roots(repository_root: &Path, folder_grant: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for args in [
        ["rev-parse", "--absolute-git-dir"].as_slice(),
        ["rev-parse", "--git-common-dir"].as_slice(),
    ] {
        let Some(path) = optional_git_text(repository_root, args).ok().flatten() else {
            continue;
        };
        let path = Path::new(&path);
        let candidate = if path.is_absolute() {
            path.to_path_buf()
        } else {
            repository_root.join(path)
        };
        let Ok(candidate) = dunce::canonicalize(candidate) else {
            continue;
        };
        if (candidate == folder_grant || candidate.starts_with(folder_grant))
            && !roots.contains(&candidate)
        {
            roots.push(candidate);
        }
    }
    roots
}

fn git_is_available() -> bool {
    git_command()
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

fn git_command() -> Command {
    let mut command = Command::new("git");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn base_command(directory: &Path) -> Command {
    let mut command = git_command();
    command
        .current_dir(directory)
        .args(["-c", "core.fsmonitor=false"])
        .args(["-c", "log.showSignature=false"])
        .args(["-c", "core.hooksPath="])
        .args(["-c", "protocol.ext.allow=never"])
        .args(["--no-optional-locks", "--no-pager"])
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("LC_ALL", "C");
    command
}

fn run_git(root: &Path, args: &[&str], allow_diff_exit: bool) -> Result<String, String> {
    run_git_owned(
        root,
        args.iter().map(ToString::to_string).collect(),
        allow_diff_exit,
    )
}

fn run_git_owned(root: &Path, args: Vec<String>, allow_diff_exit: bool) -> Result<String, String> {
    let output = base_command(root)
        .args(&args)
        .output()
        .map_err(|_| "Studio could not start Git.".to_string())?;
    parse_output(
        output,
        allow_diff_exit,
        args.first().map(String::as_str).unwrap_or("operation"),
        root,
    )
}

fn parse_output(
    output: Output,
    allow_diff_exit: bool,
    operation: &str,
    root: &Path,
) -> Result<String, String> {
    let accepted = output.status.success()
        || (allow_diff_exit && output.status.code().is_some_and(|code| code == 1));
    if !accepted {
        let detail = bounded_utf8(&output.stderr, "Git diagnostic")?;
        let detail = detail
            .lines()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("");
        return Err(if detail.is_empty() {
            format!("Git {operation} failed.")
        } else {
            format!("Git {operation} failed: {}", sanitize_line(detail, root))
        });
    }
    bounded_utf8(&output.stdout, "Git output")
}

fn bounded_utf8(bytes: &[u8], label: &str) -> Result<String, String> {
    if bytes.len() > MAX_COMMAND_OUTPUT {
        return Err(format!(
            "{label} exceeded Studio's {MAX_COMMAND_OUTPUT}-byte limit."
        ));
    }
    String::from_utf8(bytes.to_vec()).map_err(|_| format!("{label} was not valid UTF-8."))
}

fn optional_git_text(root: &Path, args: &[&str]) -> Result<Option<String>, String> {
    let output = base_command(root)
        .args(args)
        .output()
        .map_err(|_| "Studio could not start Git.".to_string())?;
    if !output.status.success() {
        return Ok(None);
    }
    let text = bounded_utf8(&output.stdout, "Git output")?;
    let text = text.trim();
    Ok((!text.is_empty()).then(|| text.to_string()))
}

fn parse_ahead_behind(text: &str) -> Option<(u32, u32)> {
    let mut fields = text.split_whitespace();
    Some((fields.next()?.parse().ok()?, fields.next()?.parse().ok()?))
}

fn parse_porcelain_v1(output: &str) -> Result<Vec<GitChange>, String> {
    let mut records = output.split('\0').filter(|record| !record.is_empty());
    let mut changes = BTreeMap::<String, GitChange>::new();
    while let Some(record) = records.next() {
        if record.len() < 3 {
            return Err("Git returned an incomplete status entry.".to_string());
        }
        let bytes = record.as_bytes();
        let x = bytes[0] as char;
        let y = bytes[1] as char;
        let path = record[3..].to_string();
        validate_relative_path(&path)?;
        if x == 'R' || y == 'R' || x == 'C' || y == 'C' {
            let _original_path = records.next();
        }
        let conflict = x == 'U' || y == 'U' || matches!((x, y), ('A', 'A') | ('D', 'D'));
        let untracked = x == '?' && y == '?';
        let kind = if conflict {
            GitChangeKind::Conflict
        } else if untracked {
            GitChangeKind::Untracked
        } else if x == 'R' || y == 'R' || x == 'C' || y == 'C' {
            GitChangeKind::Renamed
        } else if x == 'D' || y == 'D' {
            GitChangeKind::Deleted
        } else if x == 'A' || y == 'A' {
            GitChangeKind::Added
        } else {
            GitChangeKind::Modified
        };
        let staged = !matches!(x, ' ' | '?');
        let unstaged = untracked || y != ' ';
        changes.insert(
            path.clone(),
            GitChange {
                path,
                kind,
                staged,
                unstaged,
            },
        );
    }
    let mut changes = changes.into_values().collect::<Vec<_>>();
    changes.sort_by(|left, right| left.kind.cmp(&right.kind).then(left.path.cmp(&right.path)));
    Ok(changes)
}

fn parse_history(output: &str) -> Result<Vec<GitCommit>, String> {
    output
        .split('\u{1e}')
        .filter(|record| !record.trim().is_empty())
        .map(|record| {
            let fields = record
                .trim_start_matches(['\n', '\r'])
                .split('\u{1f}')
                .collect::<Vec<_>>();
            if fields.len() != 6 {
                return Err("Git returned an incomplete history entry.".to_string());
            }
            Ok(GitCommit {
                sha: fields[0].to_string(),
                short_sha: fields[1].to_string(),
                author_name: fields[2].to_string(),
                author_email: fields[3].to_string(),
                timestamp: fields[4]
                    .parse()
                    .map_err(|_| "Git returned an invalid commit timestamp.".to_string())?,
                subject: fields[5].to_string(),
            })
        })
        .collect()
}

fn validate_paths(paths: &[String]) -> Result<Vec<String>, String> {
    if paths.is_empty() || paths.len() > MAX_PATHS_PER_ACTION {
        return Err(format!(
            "Choose between 1 and {MAX_PATHS_PER_ACTION} changed paths."
        ));
    }
    paths
        .iter()
        .map(|path| validate_relative_path(path).map(ToString::to_string))
        .collect()
}

fn validate_relative_path(path: &str) -> Result<&str, String> {
    if path.is_empty() || path.len() > 4096 || path.chars().any(char::is_control) {
        return Err("Git paths must be bounded printable text.".to_string());
    }
    let path_value = Path::new(path);
    if path_value.is_absolute()
        || path_value.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            ) || matches!(component, Component::Normal(value) if value.eq_ignore_ascii_case(".git"))
        })
    {
        return Err("Git paths must stay inside the authorized repository.".to_string());
    }
    Ok(path)
}

fn validate_revision(revision: &str) -> Result<(), String> {
    if !(7..=64).contains(&revision.len()) || !revision.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("Git revisions must be hexadecimal commit IDs.".to_string());
    }
    Ok(())
}

fn short_sha(sha: &str) -> String {
    sha.chars().take(7).collect()
}

fn sanitize_line(line: &str, root: &Path) -> String {
    let bounded = line
        .replace(&root.to_string_lossy().to_string(), "[repository]")
        .replace(&root.to_string_lossy().replace('\\', "/"), "[repository]");
    bounded
        .chars()
        .filter(|character| !character.is_control())
        .take(512)
        .collect::<String>()
        .trim()
        .to_string()
}

fn truncate_chars(text: String, max: usize) -> (String, bool) {
    if text.chars().count() <= max {
        return (text, false);
    }
    (text.chars().take(max).collect(), true)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        discover, parse_ahead_behind, parse_history, parse_porcelain_v1, sanitize_line, snapshot,
        validate_relative_path, validate_revision, GitAvailability, GitChangeKind,
    };

    struct RepositoryFixture {
        root: PathBuf,
    }

    impl RepositoryFixture {
        fn new(name: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "okf-studio-git-{name}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&root).expect("create repository fixture");
            let fixture = Self { root };
            fixture.git(&["init"]);
            fixture.git(&["config", "user.name", "Studio Test"]);
            fixture.git(&["config", "user.email", "studio@example.invalid"]);
            fixture
        }

        fn git(&self, args: &[&str]) -> String {
            let output = Command::new("git")
                .current_dir(&self.root)
                .args(args)
                .env("GIT_TERMINAL_PROMPT", "0")
                .output()
                .expect("run git fixture command");
            assert!(
                output.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }

        fn write(&self, path: &str, content: &str) {
            let target = self.root.join(path);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).expect("create fixture parent");
            }
            fs::write(target, content).expect("write fixture file");
        }

        fn commit_all(&self, message: &str) {
            self.git(&["add", "-A"]);
            self.git(&["commit", "--no-verify", "-m", message]);
        }
    }

    impl Drop for RepositoryFixture {
        fn drop(&mut self) {
            let temp = std::env::temp_dir();
            if self.root.starts_with(&temp)
                && self
                    .root
                    .file_name()
                    .is_some_and(|name| name.to_string_lossy().starts_with("okf-studio-git-"))
            {
                let _ = fs::remove_dir_all(&self.root);
            }
        }
    }

    #[test]
    fn parses_two_dimensional_status_and_renames() {
        let status = " M concepts/a.md\0M  concepts/b.md\0MM concepts/c.md\0?? new.md\0R  moved.md\0old.md\0UU conflict.md\0";
        let changes = parse_porcelain_v1(status).expect("parse status");
        assert_eq!(changes.len(), 6);
        let by_path = changes
            .iter()
            .map(|change| (change.path.as_str(), change))
            .collect::<std::collections::HashMap<_, _>>();
        assert!(!by_path["concepts/a.md"].staged);
        assert!(by_path["concepts/a.md"].unstaged);
        assert!(by_path["concepts/b.md"].staged);
        assert!(!by_path["concepts/b.md"].unstaged);
        assert!(by_path["concepts/c.md"].staged);
        assert!(by_path["concepts/c.md"].unstaged);
        assert_eq!(by_path["new.md"].kind, GitChangeKind::Untracked);
        assert_eq!(by_path["moved.md"].kind, GitChangeKind::Renamed);
        assert_eq!(by_path["conflict.md"].kind, GitChangeKind::Conflict);
    }

    #[test]
    fn parses_history_records_without_line_based_assumptions() {
        let output = "abcdef123456\u{1f}abcdef1\u{1f}Ada\u{1f}ada@example.com\u{1f}1750000000\u{1f}Explain the change\u{1e}";
        let commits = parse_history(output).expect("parse history");
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].subject, "Explain the change");
        assert_eq!(commits[0].timestamp, 1_750_000_000);
    }

    #[test]
    fn rejects_paths_and_revisions_that_expand_command_scope() {
        for path in ["", "../secret", "/absolute", ".git/config", "a\n.md"] {
            assert!(validate_relative_path(path).is_err(), "accepted {path:?}");
        }
        assert!(validate_relative_path("concepts/overview.md").is_ok());
        assert!(validate_revision("abcdef1").is_ok());
        assert!(validate_revision("HEAD~1").is_err());
    }

    #[test]
    fn redacts_the_repository_root_from_git_diagnostics() {
        let root = Path::new("C:\\Users\\person\\private-repository");
        assert_eq!(
            sanitize_line(
                "fatal: cannot open C:\\Users\\person\\private-repository\\.git\\index",
                root,
            ),
            "fatal: cannot open [repository]\\.git\\index",
        );
    }

    #[test]
    fn parses_tracking_counts() {
        assert_eq!(parse_ahead_behind("3\t2\n"), Some((3, 2)));
        assert_eq!(parse_ahead_behind("invalid"), None);
    }

    #[test]
    fn repository_service_stages_commits_diffs_and_softly_undoes() {
        let fixture = RepositoryFixture::new("workflow");
        fixture.write("docs/index.md", "# Bundle\n");
        fixture.commit_all("Initial bundle");
        fixture.write("docs/index.md", "# Updated bundle\n");
        fixture.write("docs/new.md", "---\ntype: Guide\n---\n");

        let scope = discover(
            &fixture.root.join("docs"),
            std::slice::from_ref(&fixture.root),
        )
        .expect("discover repository")
        .expect("repository scope");
        let before = scope.snapshot().expect("read status");
        assert_eq!(before.availability, GitAvailability::Ready);
        assert_eq!(before.changes.len(), 2);
        assert!(before.changes.iter().all(|change| change.unstaged));
        let untracked_diff = scope
            .diff(Some("docs/new.md"), false, None)
            .expect("read untracked diff");
        assert_eq!(untracked_diff.title, "Untracked file docs/new.md");
        assert!(untracked_diff.text.contains("+type: Guide"));

        scope
            .stage(&["docs/index.md".to_string()])
            .expect("stage tracked file");
        let staged = scope.snapshot().expect("read staged status");
        assert!(
            staged
                .changes
                .iter()
                .find(|change| change.path == "docs/index.md")
                .expect("tracked change")
                .staged
        );
        let diff = scope
            .diff(Some("docs/index.md"), true, None)
            .expect("read staged diff");
        assert!(diff.text.contains("Updated bundle"));

        let committed_sha = scope
            .commit("Update bundle", false)
            .expect("commit staged file");
        let after_commit = scope.snapshot().expect("read committed status");
        assert_eq!(
            after_commit.head_sha.as_deref(),
            Some(committed_sha.as_str())
        );
        assert!(after_commit
            .changes
            .iter()
            .any(|change| change.kind == GitChangeKind::Untracked));
        let history = scope.history(0, 20).expect("load history");
        assert_eq!(history.commits[0].subject, "Update bundle");

        scope.undo_commit(&committed_sha).expect("undo commit");
        let after_undo = scope.snapshot().expect("read recovered status");
        assert_ne!(after_undo.head_sha.as_deref(), Some(committed_sha.as_str()));
        assert!(after_undo.changes.iter().any(|change| change.staged));
    }

    #[test]
    fn repository_status_reports_the_destination_of_a_rename() {
        let fixture = RepositoryFixture::new("rename");
        fixture.write("docs/old.md", "# Original\n");
        fixture.commit_all("Initial bundle");
        fixture.git(&["mv", "docs/old.md", "docs/new.md"]);

        let scope = discover(
            &fixture.root.join("docs"),
            std::slice::from_ref(&fixture.root),
        )
        .expect("discover repository")
        .expect("repository scope");
        let snapshot = scope.snapshot().expect("read renamed status");
        assert_eq!(snapshot.changes.len(), 1);
        assert_eq!(snapshot.changes[0].path, "docs/new.md");
        assert_eq!(snapshot.changes[0].kind, GitChangeKind::Renamed);
    }

    #[test]
    fn discovery_does_not_expand_a_narrow_folder_grant() {
        let fixture = RepositoryFixture::new("scope");
        fixture.write("docs/index.md", "# Bundle\n");
        fixture.commit_all("Initial bundle");
        let bundle = fixture.root.join("docs");
        let error = discover(&bundle, std::slice::from_ref(&bundle))
            .expect_err("repository must exceed grant");
        assert!(error.contains("inside a larger Git repository"));

        let scope = discover(&bundle, &[bundle.clone(), fixture.root.clone()])
            .expect("discover with repository grant")
            .expect("repository scope");
        assert_eq!(
            scope.root,
            dunce::canonicalize(&fixture.root).expect("canonical repository root")
        );
    }

    #[test]
    fn snapshot_has_explicit_non_repository_state() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock after epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("okf-studio-git-plain-{nonce}"));
        fs::create_dir_all(&root).expect("create plain directory");
        let result =
            snapshot(Path::new(&root), std::slice::from_ref(&root)).expect("read plain folder");
        assert_eq!(result.availability, GitAvailability::NotRepository);
        fs::remove_dir_all(&root).expect("remove plain directory");
    }
}
