import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_TIME = 300000; // 5 minutes

class DevinClient {
  constructor() {
    this.apiEndpoint = process.env.DEVIN_API_ENDPOINT || 'https://api.devin.ai/v1';
    this.apiKey = process.env.DEVIN_API_KEY;

    if (!this.apiKey) {
      console.warn('DEVIN_API_KEY not found. Devin features will use fallback mode.');
    }

    this.client = axios.create({
      baseURL: this.apiEndpoint,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Create a new Devin session and return session info
  async createSession(prompt, options = {}) {
    const body = { prompt };
    if (options.tags) body.tags = options.tags;
    if (options.structuredOutputSchema) body.structured_output_schema = options.structuredOutputSchema;

    const response = await this.client.post('/sessions', body);
    return response.data;
  }

  // Get session details
  async getSession(sessionId) {
    const response = await this.client.get(`/sessions/${sessionId}`);
    return response.data;
  }

  // Send a message to a running session
  async sendMessage(sessionId, message) {
    const response = await this.client.post(`/sessions/${sessionId}/message`, { message });
    return response.data;
  }

  // Poll a session until it reaches a terminal state (finished or blocked)
  async pollSession(sessionId, onStatus) {
    const start = Date.now();
    while (Date.now() - start < MAX_POLL_TIME) {
      const session = await this.getSession(sessionId);
      const status = session.status_enum || session.status;

      if (onStatus) onStatus(status, session);

      if (status === 'finished' || status === 'blocked' || status === 'expired') {
        return session;
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
    throw new Error('Session polling timed out after 5 minutes');
  }

  // Extract the last assistant message from session messages
  getLastDevinMessage(session) {
    if (!session.messages || session.messages.length === 0) return null;
    const devinMessages = session.messages.filter(
      m => m.type === 'tool_output' || m.type === 'assistant' || m.type === 'devin'
    );
    return devinMessages.length > 0 ? devinMessages[devinMessages.length - 1].message : null;
  }

  // Scope an issue: create a session, poll for completion, parse results
  async scopeIssue(issue, onStatus) {
    if (!this.apiKey) return this.fallbackScoping(issue);

    try {
      const prompt = [
        `Analyze this GitHub issue and provide a JSON response with these exact fields:`,
        `- scope: a 1-2 sentence description of the work required`,
        `- complexity: integer from 1 to 10`,
        `- confidence_score: integer from 1 to 100 (how confident you are the issue can be resolved)`,
        `- requirements: array of strings listing key deliverables`,
        `- risks: array of strings listing potential blockers`,
        `- estimated_time: string like "2 hours" or "1 day"`,
        ``,
        `Issue #${issue.number}: ${issue.title}`,
        `Labels: ${issue.labels.join(', ') || 'none'}`,
        `Description: ${issue.body || 'No description provided'}`,
        ``,
        `Respond ONLY with valid JSON matching the schema above.`
      ].join('\n');

      const schema = {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          complexity: { type: 'integer', minimum: 1, maximum: 10 },
          confidence_score: { type: 'integer', minimum: 1, maximum: 100 },
          requirements: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          estimated_time: { type: 'string' }
        },
        required: ['scope', 'complexity', 'confidence_score', 'requirements', 'risks', 'estimated_time']
      };

      const { session_id, url } = await this.createSession(prompt, {
        tags: ['issue-scoping', `issue-${issue.number}`],
        structuredOutputSchema: schema
      });

      console.log(`  Devin session created: ${url}`);

      const session = await this.pollSession(session_id, (status) => {
        if (onStatus) onStatus(status);
      });

      // Try structured output first, then parse from messages
      if (session.structured_output) {
        return {
          session_id,
          session_url: url,
          ...session.structured_output
        };
      }

      // Try to parse JSON from the last message
      const lastMessage = this.getLastDevinMessage(session);
      if (lastMessage) {
        try {
          const parsed = JSON.parse(this.extractJson(lastMessage));
          return { session_id, session_url: url, ...parsed };
        } catch {
          // If parsing fails, return the raw message as scope
          return {
            session_id,
            session_url: url,
            scope: lastMessage,
            complexity: 5,
            confidence_score: 50,
            requirements: ['Review Devin session for details'],
            risks: ['Could not parse structured response'],
            estimated_time: 'See Devin session'
          };
        }
      }

      return { session_id, session_url: url, ...this.fallbackScoping(issue) };
    } catch (error) {
      console.error('Error scoping issue with Devin:', error.response?.data || error.message);
      return this.fallbackScoping(issue);
    }
  }

  // Generate an action plan for an issue
  async generateActionPlan(issue, scope, onStatus) {
    if (!this.apiKey) return this.fallbackActionPlan(issue, scope);

    try {
      // If we have an existing session, send a follow-up message
      if (scope.session_id) {
        try {
          const session = await this.getSession(scope.session_id);
          if (session.status_enum === 'blocked') {
            await this.sendMessage(scope.session_id, [
              `Now create a detailed action plan to implement this. Provide JSON with:`,
              `- steps: array of step strings`,
              `- files_to_create: array of file paths`,
              `- files_to_modify: array of file paths`,
              `- testing_strategy: string`,
              `- dependencies: array of package names`,
              `- success_criteria: array of strings`,
              `Respond ONLY with valid JSON.`
            ].join('\n'));

            const updated = await this.pollSession(scope.session_id, (status) => {
              if (onStatus) onStatus(status);
            });

            if (updated.structured_output) {
              return { session_id: scope.session_id, session_url: scope.session_url, ...updated.structured_output };
            }

            const msg = this.getLastDevinMessage(updated);
            if (msg) {
              try {
                const parsed = JSON.parse(this.extractJson(msg));
                return { session_id: scope.session_id, session_url: scope.session_url, ...parsed };
              } catch {}
            }
          }
        } catch {}
      }

      // Create a new session for planning
      const prompt = [
        `Create a detailed action plan for this GitHub issue. Provide JSON with:`,
        `- steps: array of step description strings`,
        `- files_to_create: array of file paths to create`,
        `- files_to_modify: array of file paths to modify`,
        `- testing_strategy: string describing the testing approach`,
        `- dependencies: array of required package names`,
        `- success_criteria: array of strings defining done`,
        ``,
        `Issue #${issue.number}: ${issue.title}`,
        `Description: ${issue.body || 'No description provided'}`,
        `Scope: ${scope.scope}`,
        `Complexity: ${scope.complexity}/10`,
        ``,
        `Respond ONLY with valid JSON matching the schema above.`
      ].join('\n');

      const schema = {
        type: 'object',
        properties: {
          steps: { type: 'array', items: { type: 'string' } },
          files_to_create: { type: 'array', items: { type: 'string' } },
          files_to_modify: { type: 'array', items: { type: 'string' } },
          testing_strategy: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } },
          success_criteria: { type: 'array', items: { type: 'string' } }
        },
        required: ['steps', 'files_to_create', 'files_to_modify', 'testing_strategy', 'dependencies', 'success_criteria']
      };

      const { session_id, url } = await this.createSession(prompt, {
        tags: ['action-plan', `issue-${issue.number}`],
        structuredOutputSchema: schema
      });

      console.log(`  Devin session created: ${url}`);

      const session = await this.pollSession(session_id, (status) => {
        if (onStatus) onStatus(status);
      });

      if (session.structured_output) {
        return { session_id, session_url: url, ...session.structured_output };
      }

      const lastMessage = this.getLastDevinMessage(session);
      if (lastMessage) {
        try {
          const parsed = JSON.parse(this.extractJson(lastMessage));
          return { session_id, session_url: url, ...parsed };
        } catch {}
      }

      return { session_id, session_url: url, ...this.fallbackActionPlan(issue, scope) };
    } catch (error) {
      console.error('Error generating action plan:', error.response?.data || error.message);
      return this.fallbackActionPlan(issue, scope);
    }
  }

  // Execute: create a Devin session to actually work on the issue
  async executeActionPlan(issue, actionPlan, onStatus) {
    if (!this.apiKey) {
      throw new Error('DEVIN_API_KEY is required to execute action plans');
    }

    const stepsText = (actionPlan.steps || []).join('\n');
    const prompt = [
      `Complete this GitHub issue by implementing the action plan below.`,
      ``,
      `Repository: ${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`,
      `Issue #${issue.number}: ${issue.title}`,
      `Description: ${issue.body || 'No description provided'}`,
      ``,
      `Action Plan:`,
      stepsText,
      ``,
      `Please implement the changes, write tests if applicable, and create a pull request.`
    ].join('\n');

    const { session_id, url } = await this.createSession(prompt, {
      tags: ['execution', `issue-${issue.number}`]
    });

    console.log(`  Devin execution session: ${url}`);

    // Don't wait for completion - execution can take a long time
    // Return session info immediately so the user can track it
    return {
      session_id,
      session_url: url,
      status: 'started'
    };
  }

  // Extract JSON from a string that might contain extra text
  extractJson(text) {
    // Try to find JSON object in the text
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : text;
  }

  fallbackScoping(issue) {
    const bodyLength = issue.body ? issue.body.length : 0;
    const labelCount = issue.labels.length;

    let complexity = 3;
    let confidence = 75;

    if (bodyLength > 1000) complexity += 2;
    if (labelCount > 3) complexity += 1;
    if (issue.labels.includes('bug')) complexity -= 1;
    if (issue.labels.includes('enhancement')) complexity += 1;
    if (issue.labels.includes('complex')) complexity += 3;

    complexity = Math.min(10, Math.max(1, complexity));
    confidence = Math.max(20, 100 - (complexity * 8));

    return {
      scope: `Basic analysis of issue #${issue.number}: ${issue.title}`,
      complexity,
      confidence_score: confidence,
      requirements: [
        'Review issue description',
        'Implement required changes',
        'Test the solution',
        'Update documentation if needed'
      ],
      risks: [
        'Limited context from issue description',
        'Potential unknown dependencies'
      ],
      estimated_time: `${complexity * 2} hours`,
      fallback: true
    };
  }

  fallbackActionPlan(issue, scope) {
    return {
      steps: [
        'Analyze current codebase structure',
        'Implement the required changes',
        'Test the implementation',
        'Create or update tests',
        'Update documentation',
        'Submit pull request'
      ],
      files_to_create: [],
      files_to_modify: [],
      testing_strategy: 'Manual testing and automated tests where applicable',
      dependencies: [],
      success_criteria: [
        'Issue requirements are met',
        'Code follows project standards',
        'Tests pass',
        'Documentation is updated'
      ],
      fallback: true
    };
  }
}

export default DevinClient;
