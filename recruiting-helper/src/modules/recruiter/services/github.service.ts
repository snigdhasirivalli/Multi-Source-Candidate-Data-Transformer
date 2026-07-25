import axios from 'axios';
import { RawCandidateData } from '../models/candidate.js';

export class GithubService {
  /**
   * Fetches data from GitHub public API with basic error handling
   */
  async fetchProfile(username: string): Promise<RawCandidateData | null> {
    try {
      const response = await axios.get(`https://api.github.com/users/${username}`, {
        headers: {
          'User-Agent': 'NitroStack-Recruiting-Helper'
        },
        timeout: 10000
      });

      const data = response.data;
      
      // Fetch up to 100 public repositories
      let projects: any[] = [];
      try {
        const reposResponse = await axios.get(`https://api.github.com/users/${username}/repos?per_page=100`, {
          headers: { 'User-Agent': 'NitroStack-Recruiting-Helper' },
          timeout: 10000
        });
        
        const allRepos = reposResponse.data || [];
        // Only keep original non-fork repositories
        const nonForks = allRepos.filter((repo: any) => !repo.fork);
        
        // Sort by star count (highest first), then by last updated
        nonForks.sort((a: any, b: any) => {
          if (b.stargazers_count !== a.stargazers_count) {
            return b.stargazers_count - a.stargazers_count;
          }
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });

        projects = nonForks.map((repo: any) => ({
          name: repo.name,
          description: repo.description || '',
          url: repo.html_url,
          technologies: repo.language ? [repo.language] : []
        }));
      } catch (repoError: any) {
        console.warn(`Could not fetch repos for ${username}: ${repoError.message}`);
      }
      
      return {
        source: 'github',
        tier: 'B',
        name: data.name || data.login,
        email: data.email,
        location: data.location,
        bio: data.bio,
        projects: projects,
        links: [data.html_url, data.blog].filter(Boolean) as string[],
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.warn(`GitHub user ${username} not found.`);
        return null;
      }
      console.error(`Error fetching GitHub profile for ${username}:`, error.message);
      return null;
    }
  }
}
