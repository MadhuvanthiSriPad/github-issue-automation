# GitHub Issues - Devin Integration

An automation tool that integrates Devin AI with GitHub Issues for intelligent issue analysis, planning, and execution.

## Features

- **Issue Dashboard**: Web-based interface to view and manage GitHub issues
- **CLI Tool**: Command-line interface for quick operations
- **Issue Analysis**: AI-powered scoping and confidence scoring
- **Action Planning**: Automated generation of implementation plans
- **Execution**: Automated ticket completion with Devin AI
- **GitHub Integration**: Comments and updates directly on issues

## Installation

1. Clone the repository:
```bash
git clone https://github.com/MadhuvanthiSriPad/github-issue-automation.git
cd github-issue-automation
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# GitHub Configuration
GITHUB_TOKEN=your_github_personal_access_token_here
GITHUB_OWNER=your_github_username_or_org
GITHUB_REPO=your_repository_name

# Devin Configuration
DEVIN_API_ENDPOINT=https://api.devin.ai/v1
DEVIN_API_KEY=your_devin_api_key_here

# Server Configuration
PORT=3000
HOST=localhost
```

## Usage

### Web Dashboard

Start the web dashboard:
```bash
npm run dashboard
```

The dashboard will open automatically at `http://localhost:3000`

### CLI Interface

Start the interactive CLI:
```bash
npm run cli
```

### Command Line Commands

List issues:
```bash
npm start -- list
npm start -- list --state open --labels bug,enhancement
npm start -- list --sort updated
```

Analyze a specific issue:
```bash
npm start -- analyze 123
```

## API Endpoints

The dashboard exposes the following API endpoints:

- `GET /api/issues` - List issues with optional filters
- `GET /api/issues/:number` - Get specific issue details
- `POST /api/issues/:number/analyze` - Analyze an issue with Devin
- `POST /api/issues/:number/plan` - Generate action plan
- `POST /api/issues/:number/execute` - Execute action plan
- `POST /api/issues/:number/comment` - Add comment to issue
- `PUT /api/issues/:number` - Update issue

## Workflow

1. **Issue Discovery**: View issues in the dashboard or CLI
2. **Analysis**: Click "Analyze" to get AI-powered scoping and confidence score
3. **Planning**: Generate detailed action plans with implementation steps
4. **Execution**: Automatically execute the plan and update the GitHub issue

## Configuration

### GitHub Token

Create a personal access token with the following permissions:
- `repo` (Full control of private repositories)
- `issues:write` (Read and write issues)

### Devin API

Configure your Devin API endpoint and API key in the `.env` file.

## Development

Start development server with auto-reload:
```bash
npm run dev
```

## Project Structure

```
src/
├── github-client.js    # GitHub API integration
├── devin-client.js     # Devin AI API integration
├── cli.js             # Command-line interface
├── dashboard.js       # Web dashboard server
├── index.js           # Main entry point
└── public/
    └── index.html     # Dashboard UI
```

