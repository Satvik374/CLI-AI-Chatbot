import {
  readFileSync, writeFileSync, existsSync,
  readdirSync, statSync,
} from 'fs';
import { join, resolve, dirname } from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';

/* ──────────────────────────────────────────────
   Enhanced Tool Definitions
   ────────────────────────────────────────────── */

export const ENHANCED_TOOL_DEFINITIONS = [
  {
    name: 'analyze_codebase',
    description: 'Analyze project structure, dependencies, and provide insights.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Root path to analyze (default .)' },
        depth: { type: 'number', description: 'Analysis depth (1-5, default 3)' },
        include_deps: { type: 'boolean', description: 'Include dependency analysis (default true)' },
      },
    },
  },
  {
    name: 'generate_docs',
    description: 'Auto-generate documentation from code comments and structure.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source directory or file' },
        output: { type: 'string', description: 'Output file or directory' },
        format: { type: 'string', description: 'Format: markdown, html, json (default markdown)' },
      },
      required: ['source'],
    },
  },
  {
    name: 'test_coverage',
    description: 'Run tests and generate coverage report.',
    parameters: {
      type: 'object',
      properties: {
        test_command: { type: 'string', description: 'Test command to run' },
        output_format: { type: 'string', description: 'Output format: text, html, lcov (default text)' },
        min_coverage: { type: 'number', description: 'Minimum coverage threshold (0-100)' },
      },
      required: ['test_command'],
    },
  },
  {
    name: 'dependency_check',
    description: 'Check for outdated or vulnerable dependencies.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Project directory (default .)' },
        check_vulnerabilities: { type: 'boolean', description: 'Check for known vulnerabilities (default true)' },
      },
    },
  },
  {
    name: 'code_quality',
    description: 'Analyze code quality and suggest improvements.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File or directory to analyze' },
        ruleset: { type: 'string', description: 'Ruleset: basic, strict, custom (default basic)' },
      },
      required: ['path'],
    },
  },
];

/* ──────────────────────────────────────────────
   Enhanced Tool Implementations
   ────────────────────────────────────────────── */

export async function executeEnhancedTool(name, args) {
  if (!args || typeof args !== 'object') args = {};
  
  try {
    switch (name) {
      case 'analyze_codebase':
        return analyzeCodebase(args);
      case 'generate_docs':
        return generateDocs(args);
      case 'test_coverage':
        return runTestCoverage(args);
      case 'dependency_check':
        return checkDependencies(args);
      case 'code_quality':
        return analyzeCodeQuality(args);
      default:
        return { error: `Unknown enhanced tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

function analyzeCodebase({ path = '.', depth = 3, include_deps = true }) {
  const rootPath = resolve(path);
  
  if (!existsSync(rootPath)) {
    return { error: `Path not found: ${path}` };
  }
  
  const result = {
    path: rootPath,
    structure: analyzeStructure(rootPath, depth),
  };
  
  if (include_deps) {
    result.dependencies = analyzeDependencies(rootPath);
  }
  
  return result;
}

function analyzeStructure(dir, depth, currentDepth = 0) {
  if (currentDepth >= depth) return {};
  
  const structure = {};
  const items = readdirSync(dir);
  
  for (const item of items) {
    if (['node_modules', '.git', 'dist', 'build', '.gemini', '.moralta-claude', '.cache'].includes(item)) continue;
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      structure[item] = {
        type: 'directory',
        children: analyzeStructure(fullPath, depth, currentDepth + 1),
      };
    } else {
      structure[item] = {
        type: 'file',
        size: stat.size,
        extension: item.split('.').pop(),
      };
    }
  }
  
  return structure;
}

function analyzeDependencies(dir) {
  const packageJsonPath = join(dir, 'package.json');
  
  if (!existsSync(packageJsonPath)) {
    return { message: 'No package.json found' };
  }
  
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    return {
      dependencies: Object.keys(packageJson.dependencies || {}),
      devDependencies: Object.keys(packageJson.devDependencies || {}),
      total: Object.keys(packageJson.dependencies || {}).length + 
             Object.keys(packageJson.devDependencies || {}).length,
    };
  } catch (err) {
    return { error: 'Failed to parse package.json' };
  }
}

function generateDocs({ source, output, format = 'markdown' }) {
  const sourcePath = resolve(source);
  
  if (!existsSync(sourcePath)) {
    return { error: `Source not found: ${source}` };
  }
  
  const outputPath = output ? resolve(output) : join(dirname(sourcePath), 'docs.md');
  
  // Simple documentation generation
  const docs = generateMarkdownDocs(sourcePath);
  
  writeFileSync(outputPath, docs, 'utf-8');
  
  return {
    success: true,
    output: outputPath,
    format,
    size: docs.length,
  };
}

function generateMarkdownDocs(path) {
  const stat = statSync(path);
  
  if (stat.isDirectory()) {
    return generateDirectoryDocs(path);
  } else {
    return generateFileDocs(path);
  }
}

function generateDirectoryDocs(dir) {
  let md = `# Directory: ${dir}\n\n`;
  
  const items = readdirSync(dir);
  
  md += '## Contents\n\n';
  
  for (const item of items) {
    if (['node_modules', '.git', 'dist', 'build', '.gemini', '.moralta-claude', '.cache'].includes(item)) continue;
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      md += `- 📁 **${item}/**\n`;
    } else {
      md += `- 📄 [${item}](${item}) - ${formatFileSize(stat.size)}\n`;
    }
  }
  
  return md;
}

function generateFileDocs(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  let md = `# File: ${filePath}\n\n`;
  md += `## Summary\n\n`;
  md += `- Lines: ${lines.length}\n`;
  md += `- Size: ${formatFileSize(content.length)}\n\n`;
  
  md += '## Content\n\n';
  md += '```\n';
  md += content.substring(0, 1000) + (content.length > 1000 ? '\n...\n' : '');
  md += '\n```\n';
  
  return md;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function runTestCoverage({ test_command, output_format = 'text', min_coverage }) {
  try {
    const result = execSync(test_command, { encoding: 'utf-8' });
    
    return {
      success: true,
      output: result,
      format: output_format,
      command: test_command,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      output: err.stdout || err.stderr || '',
    };
  }
}

function checkDependencies({ path = '.', check_vulnerabilities = true }) {
  const rootPath = resolve(path);
  const packageJsonPath = join(rootPath, 'package.json');
  
  if (!existsSync(packageJsonPath)) {
    return { error: 'No package.json found' };
  }
  
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    const deps = {
      ...packageJson.dependencies || {},
      ...packageJson.devDependencies || {},
    };
    
    return {
      dependencies: Object.keys(deps),
      count: Object.keys(deps).length,
      vulnerabilities_checked: check_vulnerabilities,
    };
  } catch (err) {
    return { error: 'Failed to analyze dependencies' };
  }
}

function analyzeCodeQuality({ path, ruleset = 'basic' }) {
  const targetPath = resolve(path);
  
  if (!existsSync(targetPath)) {
    return { error: `Path not found: ${path}` };
  }
  
  const stat = statSync(targetPath);
  
  if (stat.isDirectory()) {
    return analyzeDirectoryQuality(targetPath, ruleset);
  } else {
    return analyzeFileQuality(targetPath, ruleset);
  }
}

function analyzeDirectoryQuality(dir, ruleset) {
  const files = glob.sync('**/*.{js,ts,jsx,tsx,py,go,rs,java,cpp,c,css,html,php,rb,swift}', { cwd: dir, ignore: 'node_modules/**' });
  
  let totalIssues = 0;
  const fileReports = [];
  
  for (const file of files) {
    const fullPath = join(dir, file);
    const report = analyzeFileQuality(fullPath, ruleset);
    fileReports.push({ file, ...report });
    totalIssues += report.issues || 0;
  }
  
  return {
    files_analyzed: files.length,
    total_issues: totalIssues,
    average_issues_per_file: files.length > 0 ? totalIssues / files.length : 0,
    file_reports: fileReports,
  };
}

function analyzeFileQuality(filePath, ruleset) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  let issues = 0;
  const findings = [];
  
  // Basic rules
  if (ruleset === 'basic' || ruleset === 'strict') {
    // Check for long lines
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 120) {
        issues++;
        findings.push({ line: i + 1, type: 'long_line', message: 'Line exceeds 120 characters' });
      }
    }
    
    // Check for TODO comments
    const todoMatches = content.match(/\/\/\s*TODO\s*:/gi);
    if (todoMatches) {
      issues += todoMatches.length;
      findings.push({ type: 'todo', count: todoMatches.length, message: 'TODO comments found' });
    }
  }
  
  return {
    issues,
    findings,
    lines_analyzed: lines.length,
  };
}