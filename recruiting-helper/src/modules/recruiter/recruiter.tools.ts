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
      message: `Successfully merged ${records.length} sources. You can view the full profile in the candidate_report resource.`
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
    name: 'batch_evaluate_candidates',
    description: 'Evaluate multiple candidates at once by passing their details as an array.',
    inputSchema: z.object({
      candidates: z.array(z.object({
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
          links: z.array(z.string()).optional().describe('URLs or links found in resume, including LinkedIn profile URL, personal blog, portfolio links, etc.'),
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
        }).optional().describe('Structured data that YOU (the AI) intelligently extracted from the uploaded resume text')
      }))
    })
  })
  async batchEvaluateCandidates(input: any, ctx: ExecutionContext) {
    const results = [];
    for (const cand of input.candidates) {
      ctx.logger.info(`Batch processing candidate: ${cand.candidate_id}`);
      try {
        const res = await this.evaluateCandidate(cand, ctx);
        results.push(res);
      } catch (error: any) {
        ctx.logger.error(`Error evaluating ${cand.candidate_id}: ${error.message}`);
        results.push({
          status: 'error',
          candidate_id: cand.candidate_id,
          message: error.message
        });
      }
    }
    return {
      status: 'success',
      processedCount: results.length,
      results
    };
  }

  @Tool({
    name: 'get_all_candidates_reports',
    description: 'Fetch all candidate reports currently saved in the outputs folder.',
    inputSchema: z.object({})
  })
  async getAllCandidatesReports(input: any, ctx: ExecutionContext) {
    const outputsDir = path.join(process.cwd(), 'outputs');
    if (!fs.existsSync(outputsDir)) {
      return { candidates: [] };
    }
    const files = fs.readdirSync(outputsDir).filter(f => f.endsWith('.json'));
    const candidates = [];
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(outputsDir, f), 'utf8');
        candidates.push(JSON.parse(content));
      } catch (e: any) {
        ctx.logger.error(`Error reading candidate file ${f}: ${e.message}`);
      }
    }
    return { candidates };
  }

  @Tool({
    name: 'read_local_file',
    description: 'Read the text content of a local file (.pdf, .docx, .txt) in the workspace.',
    inputSchema: z.object({
      file_path: z.string().describe('Relative path to the file from the workspace root (e.g. sample_inputs/chand_main_resume.pdf)')
    })
  })
  async readLocalFile(input: any, ctx: ExecutionContext) {
    const fullPath = path.resolve(process.cwd(), input.file_path);
    // Security check: ensure it is inside the workspace
    if (!fullPath.startsWith(process.cwd())) {
      throw new Error("Access denied: File must be inside the workspace.");
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

  @Tool({
    name: 'read_candidates_csv',
    description: 'Read a Google Forms CSV export containing candidates (candidate_id, github_username, portfolio_url, resume_path) and automatically extract all resume texts.',
    inputSchema: z.object({
      csv_path: z.string().describe('Relative path to the CSV file (e.g. sample_inputs/candidates.csv)')
    })
  })
  async readCandidatesCsv(input: any, ctx: ExecutionContext) {
    const fullPath = path.resolve(process.cwd(), input.csv_path);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`CSV file not found at: ${input.csv_path}`);
    }

    const fileContent = fs.readFileSync(fullPath, 'utf8');
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) {
      return { candidates: [] };
    }

    const candidates = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < 4) continue;

      const candId = cols[0];
      const ghUser = cols[1];
      const portfolioUrl = cols[2];
      const resumePath = cols[3];

      let resumeText = '';
      try {
        let fullResumePath = path.resolve(process.cwd(), resumePath);
        if (!fs.existsSync(fullResumePath)) {
          fullResumePath = path.resolve(process.cwd(), '..', resumePath);
        }
        if (fs.existsSync(fullResumePath)) {
          const ext = path.extname(fullResumePath).toLowerCase();
          if (ext === '.pdf') {
            const buffer = fs.readFileSync(fullResumePath);
            resumeText = await parsePdfText(buffer);
          } else if (ext === '.docx') {
            const buffer = fs.readFileSync(fullResumePath);
            const docxData = await mammoth.extractRawText({ buffer });
            resumeText = docxData.value;
          } else {
            resumeText = fs.readFileSync(fullResumePath, 'utf8');
          }
        } else {
          ctx.logger.warn(`Resume file not found at ${resumePath} or ${fullResumePath}`);
        }
      } catch (err: any) {
        ctx.logger.error(`Error reading resume file ${resumePath}: ${err.message}`);
      }

      candidates.push({
        candidate_id: candId,
        github_username: ghUser,
        portfolio_url: portfolioUrl,
        resume_text: resumeText
      });
    }

    return { candidates };
  }
}
