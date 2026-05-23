const { Octokit } = require('@octokit/rest');
require('dotenv').config();

// Initialize GitHub client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const USERNAME = process.env.GITHUB_USERNAME;
const CHECK_INTERVAL = 60000; // 60 seconds

// Memory: track what we've already notified about (prevents duplicate alerts)
const notifiedItems = new Set();
let isFirstRun = true;
let watcherInterval = null;

/**
 * Check if GitHub is reachable and token works
 */
async function verifyConnection() {
  try {
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`✅ GitHub connected as @${user.login}`);
    return { success: true, user };
  } catch (err) {
    console.error('❌ GitHub connection failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get PRs that need YOUR review
 */
async function getPRsNeedingReview() {
  try {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: `review-requested:${USERNAME} is:pr is:open`,
      per_page: 10
    });
    return data.items;
  } catch (err) {
    console.warn('⚠️ getPRsNeedingReview failed:', err.message);
    return [];
  }
}

/**
 * Get issues assigned to you
 */
async function getAssignedIssues() {
  try {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: `assignee:${USERNAME} is:issue is:open`,
      per_page: 10
    });
    return data.items;
  } catch (err) {
    console.warn('⚠️ getAssignedIssues failed:', err.message);
    return [];
  }
}

/**
 * Get mentions of you in recent comments
 */
async function getMentions() {
  try {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: `mentions:${USERNAME} is:open`,
      per_page: 10
    });
    return data.items;
  } catch (err) {
    console.warn('⚠️ getMentions failed:', err.message);
    return [];
  }
}

/**
 * Get notifications (covers many event types)
 */
async function getNotifications() {
  try {
    const { data } = await octokit.activity.listNotificationsForAuthenticatedUser({
      per_page: 20,
      all: false  // only unread
    });
    return data;
  } catch (err) {
    console.warn('⚠️ getNotifications failed:', err.message);
    return [];
  }
}

/**
 * Get your repos so we can check builds
 */
async function getYourRepos() {
  try {
    const { data } = await octokit.repos.listForAuthenticatedUser({
      per_page: 30,
      sort: 'updated'
    });
    return data;
  } catch (err) {
    console.warn('⚠️ getYourRepos failed:', err.message);
    return [];
  }
}

/**
 * Check recent workflow (CI/CD) failures
 */
async function getRecentBuildFailures() {
  try {
    const repos = await getYourRepos();
    const failures = [];
    
    // Check last 5 repos for recent failed runs
    for (const repo of repos.slice(0, 5)) {
      try {
        const { data } = await octokit.actions.listWorkflowRunsForRepo({
          owner: repo.owner.login,
          repo: repo.name,
          status: 'failure',
          per_page: 3
        });
        
        for (const run of data.workflow_runs) {
          const ageMinutes = (Date.now() - new Date(run.created_at).getTime()) / 60000;
          // Only failures from last 24 hours
          if (ageMinutes < 1440) {
            failures.push({
              ...run,
              repoName: repo.name,
              repoFullName: repo.full_name
            });
          }
        }
      } catch (e) {
        // Some repos may not have actions enabled — skip silently
      }
    }
    return failures;
  } catch (err) {
    console.warn('⚠️ getBuildFailures failed:', err.message);
    return [];
  }
}

/**
 * Main check function — runs every 60 seconds
 * Returns NEW events (not seen before) to show user
 */
async function checkForUpdates() {
  console.log('🐙 Checking GitHub...');
  const newEvents = [];

  // 1. PRs needing review
  const prs = await getPRsNeedingReview();
  for (const pr of prs) {
    const key = `pr-review-${pr.id}`;
    if (!notifiedItems.has(key)) {
      notifiedItems.add(key);
      if (!isFirstRun) {  // don't spam on first startup
        newEvents.push({
          type: 'pr-review',
          priority: 'high',
          title: `PR needs your review`,
          message: `"${pr.title}" by @${pr.user.login}`,
          url: pr.html_url,
          number: pr.number,
          repo: pr.repository_url.split('/').slice(-2).join('/'),
          actions: ['View', 'Approve', 'Later']
        });
      }
    }
  }

  // 2. Issues assigned to you
  const issues = await getAssignedIssues();
  for (const issue of issues) {
    const key = `issue-${issue.id}`;
    if (!notifiedItems.has(key)) {
      notifiedItems.add(key);
      if (!isFirstRun) {
        newEvents.push({
          type: 'issue-assigned',
          priority: 'medium',
          title: `New issue assigned`,
          message: `"${issue.title}"`,
          url: issue.html_url,
          number: issue.number,
          repo: issue.repository_url.split('/').slice(-2).join('/'),
          actions: ['View', 'Later']
        });
      }
    }
  }

  // 3. Mentions
  const mentions = await getMentions();
  for (const mention of mentions) {
    const key = `mention-${mention.id}-${mention.updated_at}`;
    if (!notifiedItems.has(key)) {
      notifiedItems.add(key);
      if (!isFirstRun) {
        newEvents.push({
          type: 'mention',
          priority: 'medium',
          title: `You were mentioned`,
          message: `In "${mention.title}"`,
          url: mention.html_url,
          number: mention.number,
          actions: ['View', 'Later']
        });
      }
    }
  }

  // 4. Build failures
  const failures = await getRecentBuildFailures();
  for (const failure of failures) {
    const key = `build-fail-${failure.id}`;
    if (!notifiedItems.has(key)) {
      notifiedItems.add(key);
      if (!isFirstRun) {
        newEvents.push({
          type: 'build-failure',
          priority: 'high',
          title: `Build failed`,
          message: `${failure.name} on ${failure.repoName}`,
          url: failure.html_url,
          repo: failure.repoFullName,
          actions: ['View Logs', 'Ignore']
        });
      }
    }
  }

  // After first run, future events are "real"
  if (isFirstRun) {
    console.log(`🐙 First scan complete. Tracking ${notifiedItems.size} existing items.`);
    isFirstRun = false;
  } else if (newEvents.length > 0) {
    console.log(`🐙 Found ${newEvents.length} new event(s)`);
  } else {
    console.log('🐙 No new events');
  }

  return newEvents;
}

/**
 * Get a summary of your GitHub activity (for manual trigger)
 */
async function getGitHubSummary() {
  console.log('🐙 Generating GitHub summary...');
  
  const [prs, issues, mentions, failures] = await Promise.all([
    getPRsNeedingReview(),
    getAssignedIssues(),
    getMentions(),
    getRecentBuildFailures()
  ]);

  return {
    prsNeedingReview: prs.length,
    issuesAssigned: issues.length,
    mentions: mentions.length,
    buildFailures: failures.length,
    items: { prs, issues, mentions, failures }
  };
}

/**
 * Start the background watcher
 * @param {Function} onNewEvent — called when new events found
 */
function startWatcher(onNewEvent) {
  console.log(`🐙 Starting GitHub watcher for @${USERNAME}`);
  console.log(`🐙 Check interval: ${CHECK_INTERVAL / 1000}s`);
  
  // Run immediately
  checkForUpdates().then(events => {
    if (events.length > 0) events.forEach(e => onNewEvent(e));
  });
  
  // Then every 60 seconds
  watcherInterval = setInterval(async () => {
    const events = await checkForUpdates();
    events.forEach(event => onNewEvent(event));
  }, CHECK_INTERVAL);
}

/**
 * Stop the watcher
 */
function stopWatcher() {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
    console.log('🐙 Watcher stopped');
  }
}

module.exports = {
  verifyConnection,
  startWatcher,
  stopWatcher,
  checkForUpdates,
  getGitHubSummary
};