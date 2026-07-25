import axios from 'axios';
import * as cheerio from 'cheerio';
import { RawCandidateData } from '../models/candidate.js';

export class PortfolioService {
  /**
   * Scrapes a portfolio website for basic details like name, bio, and skills.
   */
  async fetchPortfolio(url: string): Promise<RawCandidateData | null> {
    try {
      // Ensure url has http/https
      const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
      
      const response = await axios.get(normalizedUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NitroStackBot/1.0;)'
        }
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Basic heuristics for demo purposes
      const title = $('title').text().trim();
      const h1 = $('h1').first().text().trim();
      
      const metaDescription = $('meta[name="description"]').attr('content') || '';
      const firstParagraph = $('p').first().text().trim();

      // We no longer attempt to extract skills using dumb heuristics here.
      // We rely on the AI to parse the bio or the LLM's structured resume extraction.
      
      // Look for a mailto link
      const emailLink = $('a[href^="mailto:"]').first().attr('href');
      const email = emailLink ? emailLink.replace('mailto:', '') : undefined;

      // Extract links from portfolio (including LinkedIn)
      const links: string[] = [normalizedUrl];
      $('a[href*="linkedin.com"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !links.includes(href)) {
          links.push(href);
        }
      });

      return {
        source: 'portfolio',
        tier: 'C',
        name: h1 || title.split('|')[0].trim(),
        bio: metaDescription || firstParagraph,
        email,
        links
      };
    } catch (error: any) {
      console.error(`Error scraping portfolio ${url}:`, error.message);
      return null;
    }
  }
}
