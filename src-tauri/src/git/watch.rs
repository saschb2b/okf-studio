//! Debounced repository invalidation for the active Git panel.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::Duration;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

const DEBOUNCE: Duration = Duration::from_millis(200);
const IGNORED_WORKTREE_DIRS: &[&str] = &["node_modules", "target", "dist", "build", ".venv"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStateChanged {
    bundle_root: String,
}

struct ActiveGitWatch {
    _watchers: Vec<RecommendedWatcher>,
    shutdown: Sender<()>,
}

#[derive(Default)]
pub struct GitWatchState(Mutex<Option<ActiveGitWatch>>);

pub fn start(
    app: AppHandle,
    state: &GitWatchState,
    bundle_root: String,
    repository_root: PathBuf,
    metadata_roots: Vec<PathBuf>,
) -> Result<(), String> {
    stop(state);
    let (event_tx, event_rx) = mpsc::channel::<notify::Result<Event>>();
    let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();
    let mut watchers = Vec::new();

    let mut roots = vec![repository_root.clone()];
    for metadata_root in metadata_roots {
        if metadata_root != repository_root && !metadata_root.starts_with(&repository_root) {
            roots.push(metadata_root);
        }
    }
    roots.sort();
    roots.dedup();

    for root in roots {
        let sender = event_tx.clone();
        let mut watcher = RecommendedWatcher::new(
            move |result| {
                let _ = sender.send(result);
            },
            notify::Config::default(),
        )
        .map_err(|_| "Studio could not create the Git repository watcher.".to_string())?;
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|_| "Studio could not watch this Git repository.".to_string())?;
        watchers.push(watcher);
    }
    drop(event_tx);

    std::thread::spawn(move || {
        debounce_loop(app, bundle_root, repository_root, event_rx, shutdown_rx);
    });
    let mut active = state.0.lock().unwrap_or_else(|error| error.into_inner());
    *active = Some(ActiveGitWatch {
        _watchers: watchers,
        shutdown: shutdown_tx,
    });
    Ok(())
}

pub fn stop(state: &GitWatchState) {
    let mut active = state.0.lock().unwrap_or_else(|error| error.into_inner());
    if let Some(watch) = active.take() {
        let _ = watch.shutdown.send(());
    }
}

fn debounce_loop(
    app: AppHandle,
    bundle_root: String,
    repository_root: PathBuf,
    event_rx: mpsc::Receiver<notify::Result<Event>>,
    shutdown_rx: mpsc::Receiver<()>,
) {
    loop {
        let mut pending = match event_rx.recv() {
            Ok(result) => consume(result, &repository_root),
            Err(_) => return,
        };
        loop {
            if shutdown_rx.try_recv().is_ok() {
                return;
            }
            match event_rx.recv_timeout(DEBOUNCE) {
                Ok(result) => pending |= consume(result, &repository_root),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
        if pending {
            let _ = app.emit(
                "git-state-changed",
                GitStateChanged {
                    bundle_root: bundle_root.clone(),
                },
            );
        }
    }
}

fn consume(result: notify::Result<Event>, repository_root: &Path) -> bool {
    match result {
        Ok(event) => event
            .paths
            .iter()
            .any(|path| is_relevant(path, repository_root)),
        Err(error) => {
            eprintln!("[git-watch] notify error: {error}");
            false
        }
    }
}

fn is_relevant(path: &Path, repository_root: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(repository_root) else {
        return true;
    };
    let mut components = relative.components();
    let Some(first) = components.next().and_then(|part| part.as_os_str().to_str()) else {
        return false;
    };
    if first == ".git" {
        let second = components.next().and_then(|part| part.as_os_str().to_str());
        return matches!(
            second,
            Some("index" | "HEAD" | "FETCH_HEAD" | "ORIG_HEAD" | "packed-refs" | "refs")
        );
    }
    !relative.components().any(|part| {
        part.as_os_str()
            .to_str()
            .is_some_and(|name| IGNORED_WORKTREE_DIRS.contains(&name))
    })
}

#[cfg(test)]
mod tests {
    use super::is_relevant;
    use std::path::Path;

    #[test]
    fn watches_worktree_index_head_and_refs_without_object_noise() {
        let root = Path::new("C:/repo");
        assert!(is_relevant(Path::new("C:/repo/docs/index.md"), root));
        assert!(is_relevant(Path::new("C:/repo/.git/index"), root));
        assert!(is_relevant(Path::new("C:/repo/.git/HEAD"), root));
        assert!(is_relevant(Path::new("C:/repo/.git/refs/heads/main"), root));
        assert!(!is_relevant(Path::new("C:/repo/.git/objects/aa/bb"), root));
        assert!(!is_relevant(
            Path::new("C:/repo/node_modules/pkg/file.js"),
            root
        ));
    }

    #[test]
    fn treats_authorized_metadata_roots_outside_the_worktree_as_relevant() {
        assert!(is_relevant(
            Path::new("C:/repo/.git/worktrees/docs/index"),
            Path::new("C:/repo-worktree"),
        ));
    }
}
