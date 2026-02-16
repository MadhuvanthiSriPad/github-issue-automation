import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import GitHubClient from './github-client.js';
import DevinClient from './devin-client.js';
import open from 'open';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Dashboard {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.githubClient = new GitHubClient();
    this.devinClient = new DevinClient();

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  setupRoutes() {
    // List issues
    this.app.get('/api/issues', async (req, res) => {
      try {
        const { state = 'open', labels, sort = 'created' } = req.query;
        const issues = await this.githubClient.getIssues({
          state,
          labels: labels ? labels.split(',') : [],
          sort
        });
        res.json(issues);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get single issue with comments
    this.app.get('/api/issues/:number', async (req, res) => {
      try {
        const issue = await this.githubClient.getIssue(req.params.number);
        const comments = await this.githubClient.getIssueComments(req.params.number);
        res.json({ ...issue, comments });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Analyze issue with Devin (creates a session, polls, returns results)
    this.app.post('/api/issues/:number/analyze', async (req, res) => {
      try {
        const issue = await this.githubClient.getIssue(req.params.number);
        const analysis = await this.devinClient.scopeIssue(issue);
        res.json(analysis);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Generate action plan with Devin
    this.app.post('/api/issues/:number/plan', async (req, res) => {
      try {
        const issue = await this.githubClient.getIssue(req.params.number);
        const analysis = req.body.analysis || await this.devinClient.scopeIssue(issue);
        const actionPlan = await this.devinClient.generateActionPlan(issue, analysis);
        res.json(actionPlan);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Execute action plan with Devin (returns session immediately)
    this.app.post('/api/issues/:number/execute', async (req, res) => {
      try {
        const issue = await this.githubClient.getIssue(req.params.number);
        const { actionPlan } = req.body;

        if (!actionPlan) {
          return res.status(400).json({ error: 'Action plan is required' });
        }

        const result = await this.devinClient.executeActionPlan(issue, actionPlan);

        // Add comment to GitHub issue
        await this.githubClient.addComment(issue.number,
          `**Devin AI Session Started**\n\n` +
          `Session: ${result.session_url}\n` +
          `Status: ${result.status}\n\n` +
          `Action Plan:\n${(actionPlan.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}`
        );

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get Devin session status
    this.app.get('/api/sessions/:sessionId', async (req, res) => {
      try {
        const session = await this.devinClient.getSession(req.params.sessionId);
        res.json(session);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Add comment to issue
    this.app.post('/api/issues/:number/comment', async (req, res) => {
      try {
        const { body } = req.body;
        const comment = await this.githubClient.addComment(req.params.number, body);
        res.json(comment);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update issue
    this.app.put('/api/issues/:number', async (req, res) => {
      try {
        const updatedIssue = await this.githubClient.updateIssue(req.params.number, req.body);
        res.json(updatedIssue);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Serve the main dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  async start() {
    try {
      this.app.listen(this.port, () => {
        console.log(`Dashboard running at http://localhost:${this.port}`);
      });

      // Auto-open browser
      setTimeout(() => {
        open(`http://localhost:${this.port}`);
      }, 1000);

    } catch (error) {
      console.error('Failed to start dashboard:', error.message);
      process.exit(1);
    }
  }
}

// Start dashboard if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const dashboard = new Dashboard();
  dashboard.start().catch(console.error);
}

export default Dashboard;
