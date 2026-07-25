import * as fs from 'fs';
import * as path from 'path';
import { RawCandidateData } from '../models/candidate.js';

export class ResumeService {
  /**
   * Processes structured resume data extracted by the LLM. 
   */
  async processResumeData(data: any): Promise<RawCandidateData | null> {
    try {
      if (!data) return null;

      return {
        source: 'uploaded_resume',
        tier: 'A',
        name: data.name,
        email: data.email,
        phone: data.phone,
        location: data.location,
        skills: data.skills || [],
        links: data.links || [],
        experience: data.experience || [],
        projects: data.projects || [],
        bio: data.bio
      };
    } catch (error: any) {
      console.error(`Error processing structured resume data:`, error.message);
      return null;
    }
  }
}
