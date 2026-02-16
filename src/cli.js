#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import GitHubClient from './github-client.js';
import DevinClient from './devin-client.js';

class CLI {
  constructor() {
    this.githubClient = new GitHubClient();
    this.devinClient = new DevinClient();
  }

  async start() {
    console.log(chalk.blue.bold('\n🤖 GitHub Issues - Devin Integration\n'));
    
    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '📋 List Issues', value: 'list' },
            { name: '🔍 Analyze Issue', value: 'analyze' },
            { name: '📝 Generate Action Plan', value: 'plan' },
            { name: '🚀 Execute Issue', value: 'execute' },
            { name: '❌ Exit', value: 'exit' }
          ]
        }
      ]);

      if (action === 'exit') {
        console.log(chalk.green('👋 Goodbye!'));
        break;
      }

      try {
        await this.handleAction(action);
      } catch (error) {
        console.error(chalk.red('Error:', error.message));
      }

      console.log('\n' + '─'.repeat(50) + '\n');
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
    console.log(chalk.yellow('📋 Fetching issues...\n'));
    
    const { state } = await inquirer.prompt([
      {
        type: 'list',
        name: 'state',
        message: 'Filter by state:',
        choices: [
          { name: 'Open Issues', value: 'open' },
          { name: 'Closed Issues', value: 'closed' },
          { name: 'All Issues', value: 'all' }
        ]
      }
    ]);

    const issues = await this.githubClient.getIssues({ 
      state: state === 'all' ? 'open' : state 
    });

    if (issues.length === 0) {
      console.log(chalk.gray('No issues found.'));
      return;
    }

    console.log(chalk.blue(`\nFound ${issues.length} issues:\n`));
    
    issues.forEach((issue, index) => {
      const status = issue.state === 'open' ? 
        chalk.green('●') : chalk.red('●');
      
      const labels = issue.labels.length > 0 ? 
        chalk.gray(`[${issue.labels.join(', ')}]`) : '';
      
      const assignees = issue.assignees.length > 0 ? 
        chalk.cyan(`👤 ${issue.assignees.join(', ')}`) : '';
      
      console.log(`${status} ${chalk.bold(`#${issue.number}`)} ${issue.title}`);
      console.log(`   ${chalk.gray(issue.created_at.split('T')[0])} ${labels} ${assignees}`);
      console.log(`   ${chalk.blue(issue.html_url)}\n`);
    });
  }

  async analyzeIssue() {
    const issue = await this.selectIssue();
    if (!issue) return;

    console.log(chalk.yellow(`\n🔍 Analyzing issue #${issue.number}: ${issue.title}...\n`));
    
    const analysis = await this.devinClient.scopeIssue(issue);
    
    console.log(chalk.blue.bold('📊 Analysis Results:\n'));
    console.log(chalk.bold('Scope:'), analysis.scope);
    console.log(chalk.bold('Complexity:'), `${analysis.complexity}/10`);
    console.log(chalk.bold('Confidence Score:'), `${analysis.confidence_score}%`);
    console.log(chalk.bold('Estimated Time:'), analysis.estimated_time);
    
    console.log(chalk.bold('\n📋 Requirements:'));
    analysis.requirements.forEach((req, i) => {
      console.log(`  ${i + 1}. ${req}`);
    });
    
    if (analysis.risks.length > 0) {
      console.log(chalk.bold('\n⚠️  Risks:'));
      analysis.risks.forEach((risk, i) => {
        console.log(`  ${i + 1}. ${risk}`);
      });
    }

    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'What would you like to do next?',
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

    const analysis = await this.devinClient.scopeIssue(issue);
    await this.generateActionPlanForIssue(issue, analysis);
  }

  async generateActionPlanForIssue(issue, analysis) {
    console.log(chalk.yellow(`\n📝 Generating action plan for issue #${issue.number}...\n`));
    
    const actionPlan = await this.devinClient.generateActionPlan(issue, analysis);
    
    console.log(chalk.blue.bold('🎯 Action Plan:\n'));
    
    console.log(chalk.bold('📋 Steps:'));
    actionPlan.steps.forEach((step, i) => {
      console.log(`  ${step}`);
    });
    
    if (actionPlan.files_to_create.length > 0) {
      console.log(chalk.bold('\n📄 Files to Create:'));
      actionPlan.files_to_create.forEach(file => {
        console.log(`  ➕ ${file}`);
      });
    }
    
    if (actionPlan.files_to_modify.length > 0) {
      console.log(chalk.bold('\n📝 Files to Modify:'));
      actionPlan.files_to_modify.forEach(file => {
        console.log(`  ✏️  ${file}`);
      });
    }
    
    console.log(chalk.bold('\n🧪 Testing Strategy:'));
    console.log(`  ${actionPlan.testing_strategy}`);
    
    if (actionPlan.dependencies.length > 0) {
      console.log(chalk.bold('\n📦 Dependencies:'));
      actionPlan.dependencies.forEach(dep => {
        console.log(`  • ${dep}`);
      });
    }
    
    console.log(chalk.bold('\n✅ Success Criteria:'));
    actionPlan.success_criteria.forEach((criteria, i) => {
      console.log(`  ${i + 1}. ${criteria}`);
    });

    const { execute } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'execute',
        message: 'Would you like to execute this action plan?',
        default: false
      }
    ]);

    if (execute) {
      await this.executeActionPlan(issue, actionPlan);
    }
  }

  async executeIssue() {
    const issue = await this.selectIssue();
    if (!issue) return;

    const analysis = await this.devinClient.scopeIssue(issue);
    const actionPlan = await this.devinClient.generateActionPlan(issue, analysis);
    await this.executeActionPlan(issue, actionPlan);
  }

  async executeActionPlan(issue, actionPlan) {
    console.log(chalk.yellow(`\n🚀 Executing action plan for issue #${issue.number}...\n`));
    
    try {
      const result = await this.devinClient.executeActionPlan(issue, actionPlan);
      
      console.log(chalk.green.bold('✅ Execution Started!'));
      console.log(chalk.bold('Execution ID:'), result.execution_id);
      console.log(chalk.bold('Status:'), result.status);
      console.log(chalk.bold('Progress:'), result.progress);
      
      // Add comment to GitHub issue
      await this.githubClient.addComment(issue.number, 
        `🤖 **Devin AI Automation Started**\n\n` +
        `**Execution ID:** ${result.execution_id}\n` +
        `**Status:** ${result.status}\n` +
        `**Progress:** ${result.progress}\n\n` +
        `**Action Plan:**\n${actionPlan.steps.join('\n')}`
      );
      
      console.log(chalk.green('\n💬 Comment added to GitHub issue'));
      
    } catch (error) {
      console.error(chalk.red('Execution failed:', error.message));
      
      // Add error comment to GitHub issue
      await this.githubClient.addComment(issue.number, 
        `❌ **Devin AI Automation Failed**\n\n` +
        `**Error:** ${error.message}\n\n` +
        `Please review and try again.`
      );
    }
  }

  async selectIssue() {
    const issues = await this.githubClient.getIssues({ state: 'open' });
    
    if (issues.length === 0) {
      console.log(chalk.gray('No open issues found.'));
      return null;
    }

    const choices = issues.map(issue => ({
      name: `#${issue.number} - ${issue.title} (${issue.labels.join(', ')})`,
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
