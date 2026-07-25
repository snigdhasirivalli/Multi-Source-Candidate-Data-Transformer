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
    
    // Check for conflicts
    const uniqueValues = new Set(candidatesValues.map(c => c.value.toLowerCase().trim()));
    let finalConfidence = this.tierConfidence[winner.record.tier];

    if (uniqueValues.size > 1) {
      profile.conflicts.push({
        field,
        values: Array.from(uniqueValues),
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
      reason: uniqueValues.size > 1 ? `Won tie-breaker by evidence tier (Tier ${winner.record.tier}). Penalized for conflicts.` : 'Single or agreed value.'
    });

    return winner.value;
  }

  private mergeArrayFields(records: RawCandidateData[], profile: CandidateProfile) {
    const allSkills = new Set<string>();
    const allLinks = new Set<string>();
    const allExperience = [];
    const allProjects = new Map<string, any>(); // Map to deduplicate projects by name

    for (const r of records) {
      if (r.skills) {
        r.skills.forEach(s => allSkills.add(s));
      }
      if (r.links) {
        r.links.forEach(l => allLinks.add(l));
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
    }

    profile.skills = Array.from(allSkills);
    profile.links = Array.from(allLinks);
    profile.experience = allExperience;
    profile.projects = Array.from(allProjects.values());
  }
}
