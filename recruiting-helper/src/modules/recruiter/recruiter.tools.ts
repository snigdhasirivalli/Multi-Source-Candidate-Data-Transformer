import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { GithubService } from './services/github.service.js';
import { PortfolioService } from './services/portfolio.service.js';
import { ResumeService } from './services/resume.service.js';
import { MergeEngine } from './engine/merge.engine.js';
import * as fs from 'fs';
import * as path from 'path';

export class RecruiterTools {
  private githubService = new GithubService();
  private portfolioService = new PortfolioService();
  private resumeService = new ResumeService();
  private mergeEngine = new MergeEngine();

  @Tool({
    name: 'evaluate_candidate',
    description: 'Evaluate a candidate by merging live GitHub, Portfolio, and Resume data. Extract structured candidate data from the attached resume in your context and pass it into resume_extracted_data. CRITICAL: You must extract and include ALL experience, projects, and publications listed on the resume inside resume_extracted_data. Do not omit, combine, or truncate any entries.',
    inputSchema: z.object({
      candidate_id: z.string().describe('A unique identifier for the candidate (e.g. snigdha)'),
      github_username: z.string().optional().describe('GitHub username (optional)'),
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
        })).optional(),
        publications: z.array(z.object({
          title: z.string(),
          publisher: z.string().optional(),
          url: z.string().optional(),
          date: z.string().optional(),
          description: z.string().optional()
        })).optional()
      }).optional().describe('Structured candidate data extracted directly from the attached resume in your chat context.')
    })
  })
  async evaluateCandidate(input: any, ctx: ExecutionContext) {
    ctx.logger.info(`Evaluating candidate: ${input.candidate_id}`);

    const records = [];

    // 1. Fetch GitHub (if username provided)
    if (input.github_username && input.github_username.trim() !== '' && input.github_username.toLowerCase() !== 'null' && input.github_username.toLowerCase() !== 'n/a') {
      ctx.logger.info(`Fetching GitHub data for ${input.github_username}...`);
      const ghData = await this.githubService.fetchProfile(input.github_username);
      if (ghData) records.push(ghData);
    }

    // 2. Fetch Portfolio (if URL provided)
    if (input.portfolio_url && input.portfolio_url.trim() !== '' && input.portfolio_url.toLowerCase() !== 'null' && input.portfolio_url.toLowerCase() !== 'n/a') {
      ctx.logger.info(`Fetching Portfolio data from ${input.portfolio_url}...`);
      const ptData = await this.portfolioService.fetchPortfolio(input.portfolio_url);
      if (ptData) records.push(ptData);
    }

    // 3. Process Structured Resume Data from Attachment
    if (input.resume_extracted_data) {
      ctx.logger.info(`Processing structured resume data extracted by AI...`);
      const resData = await this.resumeService.processResumeData(input.resume_extracted_data);
      if (resData) records.push(resData);
    }

    // 4. Merge all sources
    ctx.logger.info(`Merging ${records.length} records...`);
    const finalProfile = this.mergeEngine.merge(records, input.candidate_id);

    // Save full JSON profile to disk
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
      email: finalProfile.email,
      phone: finalProfile.phone,
      location: finalProfile.location,
      has_conflicts: finalProfile.conflicts.length > 0,
      conflicts_summary: finalProfile.conflicts.map(c => c.message),
      conflicts: finalProfile.conflicts,
      skills: finalProfile.skills,
      links: finalProfile.links,
      experience: finalProfile.experience,
      projects: finalProfile.projects,
      bio_narratives: finalProfile.bio_narratives,
      output_file: outputPath,
      message: `Successfully merged ${records.length} sources into unified profile. ${finalProfile.conflicts.length > 0 ? `WARNING: Found ${finalProfile.conflicts.length} conflict(s)!` : 'No conflicts found.'}`
    };
  }
}
