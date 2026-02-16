import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class DevinClient {
  constructor() {
    this.apiEndpoint = process.env.DEVIN_API_ENDPOINT || 'https://api.devin.ai/v1';
    this.apiKey = process.env.DEVIN_API_KEY;
    
    if (!this.apiKey) {
      console.warn('DEVIN_API_KEY not found. Some features may not work.');
    }
    
    this.client = axios.create({
      baseURL: this.apiEndpoint,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async scopeIssue(issue) {
    try {
      const prompt = `
        Analyze this GitHub issue and provide:
        1. A detailed scope of work required
        2. Estimated complexity (1-10)
        3. Confidence score for successful completion (1-100)
        4. Key requirements and deliverables
        5. Potential risks or blockers
        
        Issue Details:
        Title: ${issue.title}
        Body: ${issue.body || 'No description provided'}
        Labels: ${issue.labels.join(', ')}
        Number: #${issue.number}
      `;

      const response = await this.client.post('/analyze', {
        prompt,
        type: 'issue_scoping',
        context: {
          issue_number: issue.number,
          repository: `${issue.owner}/${issue.repo}`,
          title: issue.title,
          body: issue.body,
          labels: issue.labels
        }
      });

      return {
        scope: response.data.scope,
        complexity: response.data.complexity,
        confidence_score: response.data.confidence_score,
        requirements: response.data.requirements,
        risks: response.data.risks,
        estimated_time: response.data.estimated_time
      };
    } catch (error) {
      console.error('Error scoping issue with Devin:', error.message);
      
      // Fallback to basic analysis if API is unavailable
      return this.fallbackScoping(issue);
    }
  }

  async generateActionPlan(issue, scope) {
    try {
      const prompt = `
        Based on the issue analysis, create a detailed action plan to complete this ticket:
        
        Issue: ${issue.title}
        Scope: ${scope.scope}
        Requirements: ${scope.requirements.join(', ')}
        Complexity: ${scope.complexity}/10
        
        Provide:
        1. Step-by-step implementation plan
        2. Code files to create/modify
        3. Testing strategy
        4. Dependencies required
        5. Success criteria
      `;

      const response = await this.client.post('/plan', {
        prompt,
        type: 'action_plan',
        context: {
          issue,
          scope
        }
      });

      return {
        steps: response.data.steps,
        files_to_create: response.data.files_to_create,
        files_to_modify: response.data.files_to_modify,
        testing_strategy: response.data.testing_strategy,
        dependencies: response.data.dependencies,
        success_criteria: response.data.success_criteria
      };
    } catch (error) {
      console.error('Error generating action plan with Devin:', error.message);
      
      // Fallback to basic planning
      return this.fallbackActionPlan(issue, scope);
    }
  }

  async executeActionPlan(issue, actionPlan) {
    try {
      const response = await this.client.post('/execute', {
        type: 'ticket_completion',
        context: {
          issue,
          action_plan: actionPlan
        }
      });

      return {
        execution_id: response.data.execution_id,
        status: response.data.status,
        progress: response.data.progress,
        results: response.data.results
      };
    } catch (error) {
      console.error('Error executing action plan with Devin:', error.message);
      throw error;
    }
  }

  fallbackScoping(issue) {
    const bodyLength = issue.body ? issue.body.length : 0;
    const labelCount = issue.labels.length;
    
    let complexity = 3;
    let confidence = 75;
    
    // Basic heuristics
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
      estimated_time: `${complexity * 2} hours`
    };
  }

  fallbackActionPlan(issue, scope) {
    return {
      steps: [
        '1. Analyze current codebase structure',
        '2. Implement the required changes',
        '3. Test the implementation',
        '4. Create or update tests',
        '5. Update documentation',
        '6. Submit pull request'
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
      ]
    };
  }
}

export default DevinClient;
