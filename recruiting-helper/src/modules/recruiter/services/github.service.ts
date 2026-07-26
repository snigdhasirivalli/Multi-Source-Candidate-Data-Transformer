import axios from 'axios';
import { RawCandidateData, ProjectRecord } from '../models/candidate.js';

export class GithubService {
  /**
   * Fetches data from GitHub public API including public repositories with direct URLs
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
      let projects: ProjectRecord[] = [];

      // Fetch public repositories to get direct, working project URLs
      try {
        const reposResponse = await axios.get(`https://api.github.com/users/${username}/repos?per_page=100`, {
          headers: { 'User-Agent': 'NitroStack-Recruiting-Helper' },
          timeout: 10000
        });

        const allRepos = reposResponse.data || [];
        const candidateHandle = username.toLowerCase().replace(/[\s.-]/g, '');

        // Only keep original non-fork repositories, excluding profile config repos
        const validRepos = allRepos.filter((repo: any) => {
          if (repo.fork) return false;
          const repoNorm = repo.name.toLowerCase().replace(/[\s.-]/g, '');
          if (repoNorm === candidateHandle) return false; // Exclude profile README config repo
          return true;
        });

        projects = validRepos.map((repo: any) => ({
          name: repo.name,
          description: repo.description || '',
          url: repo.html_url, // Direct live URL to project repository
          technologies: repo.language ? [repo.language] : []
        }));
      } catch (repoError: any) {
        console.warn(`Could not fetch repositories for ${username}:`, repoError.message);
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
