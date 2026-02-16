#!/usr/bin/env node

import { program } from 'commander';
import CLI from './cli.js';
import Dashboard from './dashboard.js';

program
  .name('github-devin-integration')
  .description('GitHub Issues integration with Devin AI for automated issue handling')
  .version('1.0.0');

program
  .command('cli')
  .description('Start the interactive CLI interface')
  .action(() => {
    const cli = new CLI();
    cli.start().catch(console.error);
  });

program
  .command('dashboard')
  .description('Start the web dashboard')
  .option('-p, --port <port>', 'Port to run the dashboard on', '3000')
  .action((options) => {
    if (options.port) {
      process.env.PORT = options.port;
    }
    const dashboard = new Dashboard();
    dashboard.start().catch(console.error);
  });

program
  .command('analyze <issue-number>')
  .description('Analyze a specific GitHub issue')
  .action(async (issueNumber) => {
    try {
      const GitHubClient = (await import('./github-client.js')).default;
      const DevinClient = (await import('./devin-client.js')).default;
      
      const githubClient = new GitHubClient();
      const devinClient = new DevinClient();
      
      console.log(`🔍 Analyzing issue #${issueNumber}...`);
      
      const issue = await githubClient.getIssue(issueNumber);
      const analysis = await devinClient.scopeIssue(issue);
      
      console.log('\n📊 Analysis Results:');
      console.log('Title:', issue.title);
      console.log('Scope:', analysis.scope);
      console.log('Complexity:', `${analysis.complexity}/10`);
      console.log('Confidence Score:', `${analysis.confidence_score}%`);
      console.log('Estimated Time:', analysis.estimated_time);
      
      console.log('\n📋 Requirements:');
      analysis.requirements.forEach((req, i) => {
        console.log(`  ${i + 1}. ${req}`);
      });
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List GitHub issues')
  .option('-s, --state <state>', 'Issue state (open, closed, all)', 'open')
  .option('-l, --labels <labels>', 'Comma-separated list of labels')
  .option('--sort <sort>', 'Sort by (created, updated, comments)', 'created')
  .action(async (options) => {
    try {
      const GitHubClient = (await import('./github-client.js')).default;
      const githubClient = new GitHubClient();
      
      console.log('📋 Fetching issues...');
      
      const issues = await githubClient.getIssues({
        state: options.state === 'all' ? 'open' : options.state,
        labels: options.labels ? options.labels.split(',') : [],
        sort: options.sort
      });
      
      if (issues.length === 0) {
        console.log('No issues found.');
        return;
      }
      
      console.log(`\nFound ${issues.length} issues:\n`);
      
      issues.forEach(issue => {
        const status = issue.state === 'open' ? '🟢' : '🔴';
        const labels = issue.labels.length > 0 ? ` [${issue.labels.join(', ')}]` : '';
        const assignees = issue.assignees.length > 0 ? ` 👤 ${issue.assignees.join(', ')}` : '';
        
        console.log(`${status} #${issue.number} ${issue.title}${labels}${assignees}`);
        console.log(`   ${issue.created_at.split('T')[0]} ${issue.html_url}\n`);
      });
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// If no command is provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
