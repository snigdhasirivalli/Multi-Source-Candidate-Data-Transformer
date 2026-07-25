import { ToolDecorator as Tool, Widget, ExecutionContext, z } from '@nitrostack/core';
import { GithubService } from './services/github.service.js';
import { PortfolioService } from './services/portfolio.service.js';
import { ResumeService } from './services/resume.service.js';
import { MergeEngine } from './engine/merge.engine.js';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfReq = require('pdf-parse');
const mammoth = require('mammoth');

async function parsePdfText(dataBuffer: Buffer): Promise<string> {
  try {
    if (pdfReq.PDFParse) {
      const parser = new pdfReq.PDFParse(new Uint8Array(dataBuffer));
      await parser.load();
      const res = await parser.getText();
      return typeof res === 'string' ? res : (res.text || '');
    }
    const pdfFunc = typeof pdfReq === 'function' ? pdfReq : (pdfReq.default || pdfReq);
    const pdfData = await pdfFunc(dataBuffer);
    return pdfData.text || '';
  } catch (e: any) {
    console.error('PDF parsing error:', e.message);
    return '';
  }
}

export class RecruiterTools {
  private githubService = new GithubService();
  private portfolioService = new PortfolioService();
  private resumeService = new ResumeService();
  private mergeEngine = new MergeEngine();

  @Tool({
    name: 'evaluate_candidate',
    description: 'Evaluate a candidate by fetching data from GitHub, a Portfolio URL, and an optional local Resume, then merging them to find conflicts.',
    inputSchema: z.object({
      candidate_id: z.string().describe('A unique identifier for the candidate (e.g. jdoe)'),
      github_username: z.string().describe('GitHub username to fetch live data'),
      portfolio_url: z.string().optional().describe('URL to their personal portfolio'),
      resume_extracted_data: z.object({
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        location: z.string().optional(),
        bio: z.string().optional(),
        skills: z.array(z.string()).optional(),
        links: z.array(z.string()).optional().describe('URLs or links found in resume, including LinkedIn profile URL (e.g. linkedin.com/in/...), personal portfolio, or blog links.'),
        experience: z.array(z.object({
          company: z.string(),
          title: z.string(),
          duration: z.string(),
          description: z.string()
        })).optional(),
        projects: z.array(z.object({
          name: z.string(),
          description: z.string().optional(),
          url: z.string().optional(),
          technologies: z.array(z.string()).optional()
        })).optional()
      }).optional().describe('Structured data that YOU (the AI) intelligently extracted from the uploaded resume text. Strictly separate actual employment/internships (put in experience) from personal/academic projects (put in projects).')
    })
  })
  async evaluateCandidate(input: any, ctx: ExecutionContext) {
    ctx.logger.info(`Evaluating candidate: ${input.candidate_id}`);

    const records = [];

    // 1. Fetch GitHub (if candidate has one)
    if (input.github_username && input.github_username.trim() !== '' && input.github_username.toLowerCase() !== 'null' && input.github_username.toLowerCase() !== 'n/a') {
      ctx.logger.info(`Fetching GitHub data for ${input.github_username}...`);
      const ghData = await this.githubService.fetchProfile(input.github_username);
      if (ghData) records.push(ghData);
    }

    // 2. Fetch Portfolio (if candidate has one)
    if (input.portfolio_url && input.portfolio_url.trim() !== '' && input.portfolio_url.toLowerCase() !== 'null' && input.portfolio_url.toLowerCase() !== 'n/a') {
      ctx.logger.info(`Fetching Portfolio data from ${input.portfolio_url}...`);
      const ptData = await this.portfolioService.fetchPortfolio(input.portfolio_url);
      if (ptData) records.push(ptData);
    }

    // 3. Process LLM-extracted Resume Data
    if (input.resume_extracted_data) {
      ctx.logger.info(`Processing structured resume data extracted by AI...`);
      const resData = await this.resumeService.processResumeData(input.resume_extracted_data);
      if (resData) records.push(resData);
    }

    // 4. Merge
    ctx.logger.info(`Merging ${records.length} records...`);
    const finalProfile = this.mergeEngine.merge(records, input.candidate_id);

    // Save profile to disk to be exposed via resource later
    const outputsDir = path.join(process.cwd(), 'outputs');
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }
    const outputPath = path.join(outputsDir, `${input.candidate_id}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(finalProfile, null, 2));

    ctx.logger.info(`Candidate evaluated and saved to ${outputPath}`);

    return {
      status: 'success',
      candidate_id: finalProfile.id,
      name: finalProfile.name,
      conflicts_found: finalProfile.conflicts.length,
      profile: finalProfile,
      message: `Successfully merged ${records.length} sources into a unified candidate profile.`
    };
  }

  @Tool({
    name: 'get_candidate_report',
    description: 'Fetch the detailed JSON report of a merged candidate profile.',
    inputSchema: z.object({
      candidate_id: z.string().describe('ID of the candidate (e.g. chandana)')
    })
  })
  async getCandidateReport(input: any, ctx: ExecutionContext) {
    const outputsDir = path.join(process.cwd(), 'outputs');
    const reportPath = path.join(outputsDir, `${input.candidate_id}.json`);

    if (!fs.existsSync(reportPath)) {
      throw new Error(`Candidate report for ${input.candidate_id} not found.`);
    }

    const content = fs.readFileSync(reportPath, 'utf8');
    return JSON.parse(content);
  }

  @Tool({
    name: 'read_local_file',
    description: 'Read the text content of a local file (.pdf, .docx, .txt) in the workspace.',
    inputSchema: z.object({
      file_path: z.string().describe('Relative path to the file from the workspace root (e.g. sample_inputs/chand_main_resume.pdf)')
    })
  })
  async readLocalFile(input: any, ctx: ExecutionContext) {
    let fullPath = path.resolve(process.cwd(), input.file_path);
    if (!fs.existsSync(fullPath)) {
      fullPath = path.resolve(process.cwd(), '..', input.file_path);
    }
    if (!fs.existsSync(fullPath)) {
      fullPath = path.resolve(input.file_path);
    }
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${input.file_path}`);
    }

    const ext = path.extname(fullPath).toLowerCase();
    let content = '';

    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(fullPath);
      content = await parsePdfText(dataBuffer);
    } else if (ext === '.docx') {
      const dataBuffer = fs.readFileSync(fullPath);
      const docxData = await mammoth.extractRawText({ buffer: dataBuffer });
      content = docxData.value;
    } else {
      content = fs.readFileSync(fullPath, 'utf8');
    }

    return { content };
  }
}
