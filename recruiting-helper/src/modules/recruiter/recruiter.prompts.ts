import { PromptDecorator as Prompt, ExecutionContext, z } from '@nitrostack/core';

export class RecruiterPrompts {
  @Prompt({
    name: 'analyze_fit',
    description: 'Analyze a candidate against a specific Job Description',
    arguments: [
      {
        name: 'candidate_id',
        description: 'ID of the candidate to analyze',
        required: true
      },
      {
        name: 'job_description',
        description: 'Text of the job description',
        required: true
      }
    ]
  })
  async getAnalyzeFitPrompt(args: any, ctx: ExecutionContext) {
    return [
      {
        role: 'user' as const,
        content: `Please analyze the candidate ${args.candidate_id} against the following job description:\n\n${args.job_description}\n\nFirst, call the get_candidate_report tool for candidate_id: "${args.candidate_id}" to fetch their merged profile. Then, list their strengths, weaknesses, and any conflicting data points found in their background.`
      }
    ];
  }

  @Prompt({
    name: 'batch_process_csv',
    description: 'Process all candidate applications from a Google Forms CSV export file',
    arguments: [
      {
        name: 'csv_path',
        description: 'Path to the CSV file (e.g. sample_inputs/candidates.csv)',
        required: true
      }
    ]
  })
  async getBatchProcessCsvPrompt(args: any, ctx: ExecutionContext) {
    return [
      {
        role: 'user' as const,
        content: `Please process all candidate applications from the Google Forms export CSV at "${args.csv_path}".\n\nFirst, call the read_candidates_csv tool for csv_path: "${args.csv_path}".\nFor each candidate in the list, use your AI intelligence to extract their structured resume details (name, email, phone, location, skills, links including LinkedIn profile URLs, experience, projects).\nThen, call the batch_evaluate_candidates tool with the list of candidate objects.\nFinally, call get_all_candidates_reports and present a clean Markdown comparison table showing all candidate profiles, skills, links, and data conflicts.`
      }
    ];
  }
}
