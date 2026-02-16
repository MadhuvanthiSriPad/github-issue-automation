import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

class GitHubClient {
  constructor() {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is required in environment variables');
    }
    
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });
    
    this.owner = process.env.GITHUB_OWNER;
    this.repo = process.env.GITHUB_REPO;
  }

  async getIssues(options = {}) {
    const {
      state = 'open',
      labels = [],
      sort = 'created',
      direction = 'desc',
      per_page = 50
    } = options;

    try {
      const response = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state,
        labels: labels.join(','),
        sort,
        direction,
        per_page
      });

      return response.data.map(issue => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels.map(label => label.name),
        assignees: issue.assignees.map(assignee => assignee.login),
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        html_url: issue.html_url,
        user: issue.user.login
      }));
    } catch (error) {
      console.error('Error fetching issues:', error.message);
      throw error;
    }
  }

  async getIssue(issueNumber) {
    try {
      const response = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      const issue = response.data;
      return {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels.map(label => label.name),
        assignees: issue.assignees.map(assignee => assignee.login),
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        html_url: issue.html_url,
        user: issue.user.login,
        comments: []
      };
    } catch (error) {
      console.error('Error fetching issue:', error.message);
      throw error;
    }
  }

  async getIssueComments(issueNumber) {
    try {
      const response = await this.octokit.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      return response.data.map(comment => ({
        id: comment.id,
        user: comment.user.login,
        body: comment.body,
        created_at: comment.created_at,
        updated_at: comment.updated_at
      }));
    } catch (error) {
      console.error('Error fetching issue comments:', error.message);
      throw error;
    }
  }

  async updateIssue(issueNumber, updates) {
    try {
      const response = await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        ...updates
      });

      return response.data;
    } catch (error) {
      console.error('Error updating issue:', error.message);
      throw error;
    }
  }

  async addComment(issueNumber, body) {
    try {
      const response = await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body
      });

      return response.data;
    } catch (error) {
      console.error('Error adding comment:', error.message);
      throw error;
    }
  }

  async closeIssue(issueNumber) {
    return this.updateIssue(issueNumber, { state: 'closed' });
  }
}

export default GitHubClient;
