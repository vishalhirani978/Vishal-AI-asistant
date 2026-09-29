"""
github_watcher.py — GitHub monitoring using PyGithub
"""

import os
import logging
import threading
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "")
CHECK_INTERVAL = 60  # seconds

_notified_items = set()
_is_first_run = True
_watcher_thread: threading.Thread | None = None
_stop_event = threading.Event()


def _get_github():
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if not token or token == "ghp_your_token_here":
        raise RuntimeError("GITHUB_TOKEN not configured in .env")
    from github import Github
    return Github(token)


def verify_connection() -> dict:
    try:
        g = _get_github()
        user = g.get_user()
        name = user.login
        logger.info(f"GitHub connected as @{name}")
        return {"success": True, "user": name}
    except Exception as e:
        logger.debug(f"GitHub connection check: {e}")
        return {"success": False, "error": str(e)}


def _get_prs_needing_review():
    username = os.getenv("GITHUB_USERNAME", "").strip()
    if not username:
        return []
    try:
        g = _get_github()
        results = g.search_issues(f"review-requested:{username} is:pr is:open")
        return list(results[:10])
    except Exception as e:
        logger.debug(f"getPRsNeedingReview: {e}")
        return []


def _get_assigned_issues():
    username = os.getenv("GITHUB_USERNAME", "").strip()
    if not username:
        return []
    try:
        g = _get_github()
        results = g.search_issues(f"assignee:{username} is:issue is:open")
        return list(results[:10])
    except Exception as e:
        logger.debug(f"getAssignedIssues: {e}")
        return []


def _get_mentions():
    username = os.getenv("GITHUB_USERNAME", "").strip()
    if not username:
        return []
    try:
        g = _get_github()
        results = g.search_issues(f"mentions:{username} is:open")
        return list(results[:10])
    except Exception as e:
        logger.debug(f"getMentions: {e}")
        return []


def _get_recent_build_failures():
    try:
        g = _get_github()
        user = g.get_user()
        failures = []

        for repo in user.get_repos(sort="pushed", direction="desc")[:5]:
            try:
                workflows = repo.get_workflows()
                for wf in list(workflows)[:3]:
                    runs = wf.get_runs(status="completed")
                    for run in list(runs)[:1]:
                        if run.conclusion == "failure":
                            failures.append({
                                "repoFullName": repo.full_name,
                                "name": wf.name,
                                "html_url": run.html_url,
                                "head_branch": run.head_branch,
                            })
            except Exception:
                pass
        return failures
    except Exception as e:
        logger.debug(f"getRecentBuildFailures: {e}")
        return []


def get_github_summary() -> dict:
    conn = verify_connection()
    if not conn["success"]:
        return {
            "success": False,
            "message": "GitHub token is not configured or is invalid. Add a valid GITHUB_TOKEN in .env to enable GitHub features.",
            "prsNeedingReview": 0,
            "issuesAssigned": 0,
            "mentions": 0,
            "buildFailures": 0,
        }

    prs = _get_prs_needing_review()
    issues = _get_assigned_issues()
    mentions = _get_mentions()
    failures = _get_recent_build_failures()

    msg = f"🐙 **GitHub Status for @{conn['user']}**:\n"
    msg += f"• PRs needing review: {len(prs)}\n"
    msg += f"• Assigned issues: {len(issues)}\n"
    msg += f"• Mentions: {len(mentions)}\n"
    msg += f"• Build failures: {len(failures)}"

    return {
        "success": True,
        "message": msg,
        "prsNeedingReview": len(prs),
        "issuesAssigned": len(issues),
        "mentions": len(mentions),
        "buildFailures": len(failures),
    }


def check_for_updates() -> list:
    global _notified_items, _is_first_run
    conn = verify_connection()
    if not conn["success"]:
        return []

    new_events = []
    username = conn.get("user") or GITHUB_USERNAME

    # PRs
    prs = _get_prs_needing_review()
    for pr in prs:
        key = f"pr_{pr.id}"
        if key not in _notified_items:
            _notified_items.add(key)
            if not _is_first_run:
                new_events.append({
                    "type": "pr_review_requested",
                    "title": pr.title,
                    "repo": pr.repository.full_name if hasattr(pr, "repository") else "repo",
                    "user": pr.user.login if pr.user else "someone",
                    "number": pr.number,
                    "url": pr.html_url,
                })

    # Issues
    issues = _get_assigned_issues()
    for issue in issues:
        key = f"issue_{issue.id}"
        if key not in _notified_items:
            _notified_items.add(key)
            if not _is_first_run:
                new_events.append({
                    "type": "issue_assigned",
                    "title": issue.title,
                    "repo": issue.repository.full_name if hasattr(issue, "repository") else "repo",
                    "user": issue.user.login if issue.user else "someone",
                    "number": issue.number,
                    "url": issue.html_url,
                })

    if _is_first_run:
        _is_first_run = False

    return new_events


def format_notification(event: dict) -> dict:
    t = event.get("type", "")
    title = event.get("title", "")
    repo = event.get("repo", "")
    user = event.get("user", "")
    number = event.get("number", "")

    if t == "pr_review_requested":
        return {"title": "PR Review Requested", "body": f"@{user} asked you to review #{number}: '{title}' in {repo}"}
    elif t == "issue_assigned":
        return {"title": "New Issue Assigned", "body": f"Assigned issue #{number}: '{title}' in {repo}"}
    elif t == "mention":
        return {"title": "You Were Mentioned", "body": f"Mentioned in #{number}: '{title}' in {repo}"}
    elif t == "build_failure":
        return {"title": "Build Failed", "body": f"Workflow failed in {repo}: '{title}'"}
    return {"title": "GitHub Notification", "body": f"{title} ({repo})"}


class GitHubWatcher:
    """Object-oriented wrapper for GitHub monitoring."""
    def __init__(self, callback, interval: int = 60):
        self.callback = callback
        self.interval = interval
        self._stop = threading.Event()
        self._thread = None

    def start(self):
        conn = verify_connection()
        if not conn["success"]:
            logger.info("GitHub watcher not active: no valid GITHUB_TOKEN found.")
            return

        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()

        def _run():
            while not self._stop.is_set():
                try:
                    events = check_for_updates()
                    for e in events:
                        self.callback(e)
                except Exception as ex:
                    logger.debug(f"GitHub watcher cycle: {ex}")
                self._stop.wait(self.interval)

        self._thread = threading.Thread(target=_run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
