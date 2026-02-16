#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import GitHubClient from './github-client.js';
import DevinClient from './devin-client.js';

class CLI {
  constructor() {
    this.githubClient = new GitHubClient();
    this.devinClient = new DevinClient();
    // Store analysis results keyed by issue number
    this.analysisCache = {};
  }

  async start() {
    console.log(chalk.blue.bold('\n  GitHub Issues - Devin Integration\n'));

    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'List Issues', value: 'list' },
            { name: 'Analyze Issue (Devin scoping)', value: 'analyze' },
            { name: 'Generate Action Plan', value: 'plan' },
            { name: 'Execute Issue (Devin session)', value: 'execute' },
            { name: 'Exit', value: 'exit' }
          ]
        }
      ]);

      if (action === 'exit') {
        console.log(chalk.green('Goodbye!'));
        break;
      }

      try {
        await this.handleAction(action);
      } catch (error) {
        console.error(chalk.red('Error:', error.message));
      }

      console.log('\n' + '-'.repeat(50) + '\n');
    }
  }

  async handleAction(action) {
    switch (action) {
      case 'list':
        await this.listIssues();
        break;
      case 'analyze':
        await this.analyzeIssue();
        break;
      case 'plan':
        await this.generateActionPlan();
        break;
      case 'execute':
        await this.executeIssue();
        break;
    }
  }

  async listIssues() {
    console.log(chalk.yellow('\nFetching issues...\n'));

    const { state } = await inquirer.prompt([
      {
        type: 'list',
        name: 'state',
        message: 'Filter by state:',
        choices: [
          { name: 'Open Issues', value: 'open' },
          { name: 'Closed Issues', value: 'closed' }
        ]
      }
    ]);

    const issues = await this.githubClient.getIssues({ state });

    if (issues.length === 0) {
      console.log(chalk.gray('No issues found.'));
      return;
    }

    console.log(chalk.blue(`\nFound ${issues.length} issues:\n`));

    issues.forEach((issue) => {
      const status = issue.state === 'open' ?
        chalk.green('OPEN') : chalk.red('CLOSED');

      const labels = issue.labels.length > 0 ?
        chalk.gray(`[${issue.labels.join(', ')}]`) : '';

      const assignees = issue.assignees.length > 0 ?
        chalk.cyan(`-> ${issue.assignees.join(', ')}`) : '';

      console.log(`${status} ${chalk.bold(`#${issue.number}`)} ${issue.title} ${labels} ${assignees}`);
      console.log(`     ${chalk.gray(issue.created_at.split('T')[0])} ${chalk.blue(issue.html_url)}\n`);
    });
  }

  async analyzeIssue() {
    const issue = await this.selectIssue();
    if (!issue) return;

    console.log(chalk.yellow(`\nAnalyzing issue #${issue.number}: ${issue.title}...`));
    console.log(chalk.gray('Creating Devin session and waiting for analysis...\n'));

    const analysis = await this.devinClient.scopeIssue(issue, (status) => {
      process.stdout.write(chalk.gray(`  Status: ${status}\r`));
    });

    // Cache the analysis
    this.analysisCache[issue.number] = { issue, analysis };

    if (analysis.fallback) {
      console.log(chalk.yellow('\n  Note: Using fallback analysis (Devin API unavailable)\n'));
    }

    if (analysis.session_url) {
      console.log(chalk.blue(`  Devin session: ${analysis.session_url}\n`));
    }

    console.log(chalk.bold('Analysis Results:\n'));
    console.log(chalk.bold('  Scope:'), analysis.scope);
    console.log(chalk.bold('  Complexity:'), `${analysis.complexity}/10`);
    console.log(chalk.bold('  Confidence:'), `${analysis.confidence_score}%`);
    console.log(chalk.bold('  Est. Time:'), analysis.estimated_time);

    console.log(chalk.bold('\n  Requirements:'));
    analysis.requirements.forEach((req, i) => {
      console.log(`    ${i + 1}. ${req}`);
    });

    if (analysis.risks && analysis.risks.length > 0) {
      console.log(chalk.bold('\n  Risks:'));
      analysis.risks.forEach((risk, i) => {
        console.log(`    ${i + 1}. ${risk}`);
      });
    }

    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'What next?',
        choices: [
          { name: 'Generate Action Plan', value: 'plan' },
          { name: 'Back to Main Menu', value: 'back' }
        ]
      }
    ]);

    if (nextAction === 'plan') {
      await this.generateActionPlanForIssue(issue, analysis);
    }
  }

  async generateActionPlan() {
    const issue = await this.selectIssue();
    if (!issue) return;

    // Check if we have a cached analysis
    let analysis;
    if (this.analysisCache[issue.number]) {
      const { useExisting } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useExisting',
          message: 'Use existing analysis for this issue?',
          default: true
        }
      ]);
      if (useExisting) {
        analysis = this.analysisCache[issue.number].analysis;
      }
    }

    if (!analysis) {
      console.log(chalk.yellow('\nRunning analysis first...'));
      analysis = await this.devinClient.scopeIssue(issue, (status) => {
        process.stdout.write(chalk.gray(`  Status: ${status}\r`));
      });
      this.analysisCache[issue.number] = { issue, analysis };
    }

    await this.generateActionPlanForIssue(issue, analysis);
  }

  async generateActionPlanForIssue(issue, analysis) {
    console.log(chalk.yellow(`\nGenerating action plan for issue #${issue.number}...`));
    console.log(chalk.gray('Creating Devin session...\n'));

    const actionPlan = await this.devinClient.generateActionPlan(issue, analysis, (status) => {
      process.stdout.write(chalk.gray(`  Status: ${status}\r`));
    });

    if (actionPlan.fallback) {
      console.log(chalk.yellow('\n  Note: Using fallback plan (Devin API unavailable)\n'));
    }

    if (actionPlan.session_url) {
      console.log(chalk.blue(`  Devin session: ${actionPlan.session_url}\n`));
    }

    console.log(chalk.bold('Action Plan:\n'));

    console.log(chalk.bold('  Steps:'));
    (actionPlan.steps || []).forEach((step, i) => {
      console.log(`    ${i + 1}. ${step}`);
    });

    if (actionPlan.files_to_create && actionPlan.files_to_create.length > 0) {
      console.log(chalk.bold('\n  Files to Create:'));
      actionPlan.files_to_create.forEach(file => {
        console.log(`    + ${file}`);
      });
    }

    if (actionPlan.files_to_modify && actionPlan.files_to_modify.length > 0) {
      console.log(chalk.bold('\n  Files to Modify:'));
      actionPlan.files_to_modify.forEach(file => {
        console.log(`    ~ ${file}`);
      });
    }

    console.log(chalk.bold('\n  Testing:'), actionPlan.testing_strategy);

    if (actionPlan.dependencies && actionPlan.dependencies.length > 0) {
      console.log(chalk.bold('\n  Dependencies:'));
      actionPlan.dependencies.forEach(dep => {
        console.log(`    - ${dep}`);
      });
    }

    console.log(chalk.bold('\n  Success Criteria:'));
    (actionPlan.success_criteria || []).forEach((c, i) => {
      console.log(`    ${i + 1}. ${c}`);
    });

    const { execute } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'execute',
        message: 'Execute this action plan with Devin?',
        default: false
      }
    ]);

    if (execute) {
      await this.executeActionPlanForIssue(issue, actionPlan);
    }
  }

  async executeIssue() {
    const issue = await this.selectIssue();
    if (!issue) return;

    let analysis, actionPlan;

    if (this.analysisCache[issue.number]) {
      analysis = this.analysisCache[issue.number].analysis;
    } else {
      console.log(chalk.yellow('\nRunning analysis first...'));
      analysis = await this.devinClient.scopeIssue(issue);
    }

    console.log(chalk.yellow('\nGenerating action plan...'));
    actionPlan = await this.devinClient.generateActionPlan(issue, analysis);

    await this.executeActionPlanForIssue(issue, actionPlan);
  }

  async executeActionPlanForIssue(issue, actionPlan) {
    console.log(chalk.yellow(`\nStarting Devin execution for issue #${issue.number}...\n`));

    try {
      const result = await this.devinClient.executeActionPlan(issue, actionPlan);

      console.log(chalk.green.bold('Execution Started!'));
      console.log(chalk.bold('  Session ID:'), result.session_id);
      console.log(chalk.bold('  Session URL:'), chalk.blue(result.session_url));
      console.log(chalk.bold('  Status:'), result.status);
      console.log(chalk.gray('\n  Devin is now working on the issue. Track progress at the session URL above.'));

      // Add comment to GitHub issue
      const { addComment } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addComment',
          message: 'Post a comment on the GitHub issue with the Devin session link?',
          default: true
        }
      ]);

      if (addComment) {
        await this.githubClient.addComment(issue.number,
          `**Devin AI Session Started**\n\n` +
          `Session: ${result.session_url}\n` +
          `Status: ${result.status}\n\n` +
          `Action Plan:\n${(actionPlan.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}`
        );
        console.log(chalk.green('  Comment posted to GitHub issue.'));
      }

    } catch (error) {
      console.error(chalk.red('Execution failed:', error.message));
    }
  }

  async selectIssue() {
    const issues = await this.githubClient.getIssues({ state: 'open' });

    if (issues.length === 0) {
      console.log(chalk.gray('No open issues found.'));
      return null;
    }

    const choices = issues.map(issue => ({
      name: `#${issue.number} - ${issue.title} ${issue.labels.length > 0 ? `[${issue.labels.join(', ')}]` : ''}`,
      value: issue
    }));

    const { selectedIssue } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedIssue',
        message: 'Select an issue:',
        choices
      }
    ]);

    return selectedIssue;
  }
}

// Start CLI if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new CLI();
  cli.start().catch(console.error);
}

export default CLI;
