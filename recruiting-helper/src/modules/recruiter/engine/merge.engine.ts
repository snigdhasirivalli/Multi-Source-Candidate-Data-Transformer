import { CandidateProfile, RawCandidateData, ProvenanceRecord } from '../models/candidate.js';

export class MergeEngine {
  private readonly tierConfidence = {
    'A': 0.95,
    'B': 0.70,
    'C': 0.50,
    'D': 0.30
  };

  /**
   * Merges multiple raw candidate records into a single resolved profile
   */
  merge(records: RawCandidateData[], candidateId: string): CandidateProfile {
    const profile: CandidateProfile = {
      id: candidateId,
      skills: [],
      links: [],
      experience: [],
      projects: [],
      bio_narratives: [],
      provenance: [],
      conflicts: []
    };

    if (!records || records.length === 0) return profile;

    // Filter valid records
    const validRecords = records.filter(r => r !== null);

    profile.name = this.resolveField('name', validRecords, profile);
    profile.email = this.resolveField('email', validRecords, profile);
    profile.phone = this.resolveField('phone', validRecords, profile);
    profile.location = this.resolveField('location', validRecords, profile);

    // Merge bios into bio_narratives
    for (const r of validRecords) {
      if (r.bio && r.bio.trim().length > 0) {
        profile.bio_narratives.push(r.bio.trim());
      }
    }

    // Merge array fields
    this.mergeArrayFields(validRecords, profile);

    return profile;
  }

  private getNormalizedValue(field: string, val: string): string {
    const clean = val.toLowerCase().trim();
    if (field === 'phone') {
      // Remove all non-digits and keep last 10 digits (e.g. +91 74185-97139 -> 7418597139)
      const digits = clean.replace(/[^\d]/g, '');
      return digits.slice(-10);
    }
    if (field === 'name') {
      // Remove spaces, dots, hyphens (e.g. M-Chandana -> mchandana)
      return clean.replace(/[\s.-]/g, '');
    }
    return clean;
  }

  private resolveField(field: keyof RawCandidateData, records: RawCandidateData[], profile: CandidateProfile): string | undefined {
    // Collect all candidates' values for this field
    const candidatesValues: Array<{ value: string, record: RawCandidateData }> = [];
    
    for (const r of records) {
      if (r[field] && typeof r[field] === 'string') {
        candidatesValues.push({ value: r[field] as string, record: r });
      }
    }

    if (candidatesValues.length === 0) return undefined;

    // Sort values by tier priority (A > B > C > D)
    candidatesValues.sort((a, b) => {
      const confA = this.tierConfidence[a.record.tier];
      const confB = this.tierConfidence[b.record.tier];
      return confB - confA; // descending
    });

    const winner = candidatesValues[0];
    
    // Check for conflicts using normalized values
    const normalizedValues = new Set(candidatesValues.map(c => this.getNormalizedValue(field, c.value)));
    let finalConfidence = this.tierConfidence[winner.record.tier];

    if (normalizedValues.size > 1) {
      profile.conflicts.push({
        field,
        values: Array.from(new Set(candidatesValues.map(c => c.value.trim()))),
        message: `Conflict detected across sources for ${field}`
      });
      // Apply penalty
      finalConfidence = Math.max(0, finalConfidence - 0.2);
    }

    // Record provenance
    profile.provenance.push({
      source: winner.record.source,
      field,
      rawValue: winner.value,
      normalizedValue: winner.value,
      evidenceTier: winner.record.tier,
      confidence: finalConfidence,
      action: 'merged',
      reason: normalizedValues.size > 1 ? `Won tie-breaker by evidence tier (Tier ${winner.record.tier}). Penalized for conflicts.` : 'Single or agreed value.'
    });

    return winner.value;
  }

  private getLinkHandle(url: string): { type: string; handle: string } | null {
    const cleanUrl = url.toLowerCase().trim();
    // Match linkedin.com/in/username
    if (cleanUrl.includes('linkedin.com/in/')) {
      const match = cleanUrl.match(/linkedin\.com\/in\/([a-z0-9-_%]+)/);
      if (match) return { type: 'linkedin', handle: match[1] };
    }
    // Match github.com/username
    if (cleanUrl.includes('github.com/')) {
      const match = cleanUrl.match(/github\.com\/([a-z0-9-_%]+)/);
      if (match) return { type: 'github', handle: match[1] };
    }
    return null;
  }

  private mergeArrayFields(records: RawCandidateData[], profile: CandidateProfile) {
    const allSkills = new Set<string>();
    const allExperience = [];
    const allProjects = new Map<string, any>(); // Map to deduplicate projects by name

    const finalLinks: string[] = [];
    const linkedinHandles = new Map<string, { url: string; tier: string }>();
    const githubHandles = new Map<string, { url: string; tier: string }>();
    const otherLinks = new Set<string>();

    for (const r of records) {
      if (r.skills) {
        r.skills.forEach(s => allSkills.add(s));
      }
      if (r.experience) {
        allExperience.push(...r.experience);
      }
      if (r.projects) {
        r.projects.forEach(p => {
          const key = p.name.toLowerCase().trim();
          if (!allProjects.has(key)) {
            allProjects.set(key, p);
          } else {
            // Merge technologies if they exist
            const existing = allProjects.get(key);
            if (p.technologies) {
              existing.technologies = Array.from(new Set([...(existing.technologies || []), ...p.technologies]));
            }
          }
        });
      }
      if (r.links) {
        for (const url of r.links) {
          const cleanUrl = url.trim().replace(/\/$/, ''); // strip trailing slash
          // Standardize protocol to https
          const stdUrl = cleanUrl.replace(/^http:\/\//i, 'https://');
          
          const handleInfo = this.getLinkHandle(stdUrl);
          if (handleInfo) {
            if (handleInfo.type === 'linkedin') {
              if (!linkedinHandles.has(handleInfo.handle)) {
                linkedinHandles.set(handleInfo.handle, { url: stdUrl, tier: r.tier });
              }
            } else if (handleInfo.type === 'github') {
              if (!githubHandles.has(handleInfo.handle)) {
                githubHandles.set(handleInfo.handle, { url: stdUrl, tier: r.tier });
              }
            }
          } else {
            otherLinks.add(stdUrl);
          }
        }
      }
    }

    // Check for conflicts in LinkedIn profiles
    if (linkedinHandles.size > 1) {
      profile.conflicts.push({
        field: 'linkedin',
        values: Array.from(linkedinHandles.values()).map(h => h.url),
        message: `Conflict detected: Multiple different LinkedIn handles found across sources (${Array.from(linkedinHandles.keys()).join(', ')})`
      });
    }

    // Check for conflicts in GitHub profiles
    if (githubHandles.size > 1) {
      profile.conflicts.push({
        field: 'github',
        values: Array.from(githubHandles.values()).map(h => h.url),
        message: `Conflict detected: Multiple different GitHub handles found across sources (${Array.from(githubHandles.keys()).join(', ')})`
      });
    }

    // Prioritize and add handles based on tier
    const sortAndSelectWinner = (handlesMap: Map<string, { url: string; tier: string }>) => {
      const sorted = Array.from(handlesMap.values()).sort((a, b) => {
        const confA = this.tierConfidence[a.tier as keyof typeof this.tierConfidence] || 0.3;
        const confB = this.tierConfidence[b.tier as keyof typeof this.tierConfidence] || 0.3;
        return confB - confA; // descending tier confidence
      });
      // Push winner first, then remaining so no data is lost but the primary is first
      sorted.forEach(item => finalLinks.push(item.url));
    };

    sortAndSelectWinner(linkedinHandles);
    sortAndSelectWinner(githubHandles);

    otherLinks.forEach(l => finalLinks.push(l));

    profile.skills = Array.from(allSkills);
    profile.links = Array.from(new Set(finalLinks));
    profile.experience = allExperience;
    profile.projects = Array.from(allProjects.values());
  }
}
