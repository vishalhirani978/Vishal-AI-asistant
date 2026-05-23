const { Octokit } = require('@octokit/rest');
const { shell } = require('electron');
require('dotenv').config();

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

/**
 * Open a URL in the user's default browser
 */
function openInBrowser(url) {
  console.log('🌐 [main] openInBrowser called with:', url);
  
  if (!url) {
    console.warn('🌐 [main] No URL provided!');
    return { success: false, error: 'No URL' };
  }
  
  try {
    shell.openExternal(url)
      .then(() => {
        console.log('🌐 [main] Browser opened successfully');
      })
      .catch(err => {
        console.error('🌐 [main] openExternal error:', err);
      });
    return { success: true, message: 'Opening browser...' };
  } catch (err) {
    console.error('🌐 [main] Exception:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Approve a PR
 */
async function approvePR(owner, repo, prNumber, body = 'Approved via Vishal 🤖') {
  try {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      event: 'APPROVE',
      body
    });
    console.log(`✅ Approved PR #${prNumber}`);
    return { success: true, message: 'PR approved!' };
  } catch (err) {
    console.error('❌ Approval failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Comment on PR/issue
 */
async function commentOnIssue(owner, repo, issueNumber, body) {
  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body
    });
    console.log(`💬 Commented on #${issueNumber}`);
    return { success: true, message: 'Comment posted!' };
  } catch (err) {
    console.error('❌ Comment failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Mark notifications as read
 */
async function markAllNotificationsRead() {
  try {
    await octokit.activity.markNotificationsAsRead();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Parse owner/repo from API URL
 */
function parseRepoFromUrl(url) {
  const parts = url.replace('https://api.github.com/repos/', '').split('/');
  return { owner: parts[0], repo: parts[1] };
}

// ⬇️⬇️⬇️ CRITICAL: Export ALL functions ⬇️⬇️⬇️
module.exports = {
  openInBrowser,
  approvePR,
  commentOnIssue,
  markAllNotificationsRead,
  parseRepoFromUrl
};