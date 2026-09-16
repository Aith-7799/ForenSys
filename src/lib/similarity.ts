import { prisma } from './prisma.js';
import type { Case, Evidence, DigitalEvidence, Officer } from '@prisma/client';

export interface SimilarityConfig {
  weights: {
    digital: number;
    geospatial: number;
    evidenceMo: number;
    temporal: number;
  };
  geospatial: {
    minRadiusKm: number; // Full score distance
    maxRadiusKm: number; // Zero score distance
  };
  temporal: {
    fullScoreHours: number; // Full score within 72h
    maxHours: number; // 30 days decay ceiling
    timeOfDayBonusHours: number;
  };
}

export const DEFAULT_SIMILARITY_CONFIG: SimilarityConfig = {
  weights: {
    digital: 0.40,
    geospatial: 0.25,
    evidenceMo: 0.20,
    temporal: 0.15,
  },
  geospatial: {
    minRadiusKm: 5,
    maxRadiusKm: 50,
  },
  temporal: {
    fullScoreHours: 72,
    maxHours: 720, // 30 days
    timeOfDayBonusHours: 3,
  },
};

export interface VectorBreakdown {
  vector: 'Digital Fingerprints' | 'Geospatial Proximity' | 'Evidence Profile / M.O.' | 'Temporal Clustering';
  score: number; // 0.0 to 1.0
  weight: number; // e.g. 0.40
  weightedScore: number; // score * weight * 100
  evidence: string; // Human-readable tag
  details?: Record<string, unknown>;
}

export interface SimilarCaseResult {
  caseId: string;
  title: string;
  status: string;
  incidentTimestamp: Date;
  locationPoint: string;
  leadOfficer: {
    officerId: string;
    fullName: string;
    badgeNumber: string;
    role: string;
  };
  matchPercentage: number;
  breakdown: VectorBreakdown[];
  hasDuplicateEvidenceAlert: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  status: string;
  locationPoint: string;
  incidentTimestamp: string;
  leadOfficerName: string;
  evidenceCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  similarity: number;
  tags: string[];
}

export interface CorrelationGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type CaseWithEvidence = Case & {
  leadOfficer: Officer;
  evidence: (Evidence & {
    digital: DigitalEvidence | null;
  })[];
};

/**
 * Calculates Great-Circle distance between two (lat, lon) pairs using the Haversine formula.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Parses "latitude,longitude" from locationPoint string.
 */
export function parseLocationPoint(locationStr: string): { lat: number; lng: number } | null {
  if (!locationStr) return null;
  const parts = locationStr.split(',').map((p) => parseFloat(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

/**
 * Computes pairwise similarity between two cases across the 4 weighted vectors.
 */
export function computePairwiseSimilarity(
  caseA: CaseWithEvidence,
  caseB: CaseWithEvidence,
  config: SimilarityConfig = DEFAULT_SIMILARITY_CONFIG,
): { matchPercentage: number; breakdown: VectorBreakdown[]; hasDuplicateEvidenceAlert: boolean } {
  const breakdown: VectorBreakdown[] = [];

  // -------------------------------------------------------------------------
  // 1. Digital Fingerprints (40% Weight)
  // -------------------------------------------------------------------------
  let digitalScore = 0;
  let digitalEvidenceText = 'No digital evidence overlap';
  let hasDuplicateEvidenceAlert = false;
  const matchingHashes: string[] = [];
  const matchingSerials: string[] = [];

  const digA = caseA.evidence.filter((e) => e.digital !== null).map((e) => e.digital!);
  const digB = caseB.evidence.filter((e) => e.digital !== null).map((e) => e.digital!);

  if (digA.length > 0 && digB.length > 0) {
    for (const a of digA) {
      for (const b of digB) {
        if (a.fileHashSha256 && b.fileHashSha256 && a.fileHashSha256.toLowerCase() === b.fileHashSha256.toLowerCase()) {
          matchingHashes.push(a.fileHashSha256);
          hasDuplicateEvidenceAlert = true;
        }
        if (a.deviceSerial && b.deviceSerial && a.deviceSerial.toLowerCase() === b.deviceSerial.toLowerCase()) {
          matchingSerials.push(a.deviceSerial);
          hasDuplicateEvidenceAlert = true;
        }
      }
    }

    if (matchingHashes.length > 0 && matchingSerials.length > 0) {
      digitalScore = 1.0;
      digitalEvidenceText = `Exact SHA-256 hash & serial (${matchingSerials[0]}) match`;
    } else if (matchingHashes.length > 0) {
      digitalScore = 1.0;
      digitalEvidenceText = `Shared SHA-256 Hash (${matchingHashes[0].substring(0, 8)}...)`;
    } else if (matchingSerials.length > 0) {
      digitalScore = 1.0;
      digitalEvidenceText = `Matching device serial (${matchingSerials[0]})`;
    } else {
      // Check media type overlap as weak correlation
      const mediaTypesA = new Set(digA.map((d) => d.mediaType.toLowerCase()));
      const mediaTypesB = new Set(digB.map((d) => d.mediaType.toLowerCase()));
      const sharedMedia = [...mediaTypesA].filter((m) => mediaTypesB.has(m));
      if (sharedMedia.length > 0) {
        digitalScore = 0.25;
        digitalEvidenceText = `Same digital media type (${sharedMedia.join(', ')})`;
      }
    }
  }

  breakdown.push({
    vector: 'Digital Fingerprints',
    score: digitalScore,
    weight: config.weights.digital,
    weightedScore: Math.round(digitalScore * config.weights.digital * 100),
    evidence: digitalEvidenceText,
    details: { matchingHashes, matchingSerials },
  });

  // -------------------------------------------------------------------------
  // 2. Geospatial Proximity (25% Weight)
  // -------------------------------------------------------------------------
  let geoScore = 0;
  let geoEvidenceText = 'Location coordinates unavailable';
  const locA = parseLocationPoint(caseA.locationPoint);
  const locB = parseLocationPoint(caseB.locationPoint);

  if (locA && locB) {
    const distKm = calculateHaversineDistanceKm(locA.lat, locA.lng, locB.lat, locB.lng);
    const distFormatted = distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`;

    if (distKm <= config.geospatial.minRadiusKm) {
      geoScore = 1.0;
      geoEvidenceText = `${distFormatted} proximity (Hotspot cluster ≤ ${config.geospatial.minRadiusKm} km)`;
    } else if (distKm <= config.geospatial.maxRadiusKm) {
      const decayRange = config.geospatial.maxRadiusKm - config.geospatial.minRadiusKm;
      geoScore = Math.max(0, 1 - (distKm - config.geospatial.minRadiusKm) / decayRange);
      geoEvidenceText = `${distFormatted} proximity`;
    } else {
      geoScore = 0;
      geoEvidenceText = `${distFormatted} distance (beyond ${config.geospatial.maxRadiusKm} km radius)`;
    }
  }

  breakdown.push({
    vector: 'Geospatial Proximity',
    score: geoScore,
    weight: config.weights.geospatial,
    weightedScore: Math.round(geoScore * config.weights.geospatial * 100),
    evidence: geoEvidenceText,
  });

  // -------------------------------------------------------------------------
  // 3. Evidence Profile / M.O. (20% Weight)
  // -------------------------------------------------------------------------
  let moScore = 0;
  let moEvidenceText = 'No evidence recorded';
  const typesA = new Set(caseA.evidence.map((e) => e.evidenceType));
  const typesB = new Set(caseB.evidence.map((e) => e.evidenceType));

  const union = new Set([...typesA, ...typesB]);
  if (union.size > 0) {
    const intersection = [...typesA].filter((t) => typesB.has(t));
    moScore = intersection.length / union.size; // Jaccard similarity

    if (intersection.length > 0) {
      moEvidenceText = `${intersection.length} of ${union.size} evidence types overlap (${intersection.join(', ')})`;
    } else {
      moEvidenceText = 'Distinct evidence types (no M.O. overlap)';
    }
  }

  breakdown.push({
    vector: 'Evidence Profile / M.O.',
    score: moScore,
    weight: config.weights.evidenceMo,
    weightedScore: Math.round(moScore * config.weights.evidenceMo * 100),
    evidence: moEvidenceText,
  });

  // -------------------------------------------------------------------------
  // 4. Temporal Clustering (15% Weight)
  // -------------------------------------------------------------------------
  let tempScore = 0;
  let tempEvidenceText = 'Timestamps unavailable';

  if (caseA.incidentTimestamp && caseB.incidentTimestamp) {
    const diffMs = Math.abs(caseA.incidentTimestamp.getTime() - caseB.incidentTimestamp.getTime());
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = Math.round(diffHours / 24);

    if (diffHours <= config.temporal.fullScoreHours) {
      tempScore = 1.0;
      const hoursText = diffHours < 1 ? '< 1 hour' : `${Math.round(diffHours)} hours`;
      tempEvidenceText = `Incidents ${hoursText} apart (within ${config.temporal.fullScoreHours}h window)`;
    } else if (diffHours <= config.temporal.maxHours) {
      // Linear decay
      const decayFraction = (diffHours - config.temporal.fullScoreHours) / (config.temporal.maxHours - config.temporal.fullScoreHours);
      let baseScore = Math.max(0, 1 - decayFraction * 0.8);

      // Check time-of-day / day-of-week pattern bonus
      const hourA = caseA.incidentTimestamp.getUTCHours();
      const hourB = caseB.incidentTimestamp.getUTCHours();
      const hourDiff = Math.abs(hourA - hourB);
      const dayA = caseA.incidentTimestamp.getUTCDay();
      const dayB = caseB.incidentTimestamp.getUTCDay();

      if (hourDiff <= config.temporal.timeOfDayBonusHours || hourDiff >= 24 - config.temporal.timeOfDayBonusHours) {
        baseScore = Math.min(1.0, baseScore + 0.15);
        tempEvidenceText = `Incidents ${diffDays} days apart (Matching time-of-day pattern)`;
      } else if (dayA === dayB) {
        baseScore = Math.min(1.0, baseScore + 0.10);
        tempEvidenceText = `Incidents ${diffDays} days apart (Matching day-of-week pattern)`;
      } else {
        tempEvidenceText = `Incidents ${diffDays} days apart`;
      }
      tempScore = baseScore;
    } else {
      tempScore = 0;
      tempEvidenceText = `Incidents ${diffDays} days apart (over 30 days)`;
    }
  }

  breakdown.push({
    vector: 'Temporal Clustering',
    score: tempScore,
    weight: config.weights.temporal,
    weightedScore: Math.round(tempScore * config.weights.temporal * 100),
    evidence: tempEvidenceText,
  });

  // Calculate total composite percentage
  const totalScore = breakdown.reduce((sum, item) => sum + item.score * item.weight, 0);
  const matchPercentage = Math.min(100, Math.max(0, Math.round(totalScore * 100)));

  return {
    matchPercentage,
    breakdown,
    hasDuplicateEvidenceAlert,
  };
}

/**
 * Returns ranked similar cases for a given target case ID.
 */
export async function getSimilarCases(
  targetCaseId: string,
  options: {
    excludeClosed?: boolean;
    minScore?: number;
    limit?: number;
    config?: SimilarityConfig;
  } = {},
): Promise<SimilarCaseResult[]> {
  const { excludeClosed = true, minScore = 5, limit = 20, config = DEFAULT_SIMILARITY_CONFIG } = options;

  const targetCase = await prisma.case.findUnique({
    where: { caseId: targetCaseId },
    include: {
      leadOfficer: true,
      evidence: { include: { digital: true } },
    },
  });

  if (!targetCase) {
    throw new Error(`Target case "${targetCaseId}" not found`);
  }

  const allCases = await prisma.case.findMany({
    where: {
      caseId: { not: targetCaseId },
      ...(excludeClosed ? { status: { notIn: ['closed', 'archived'] } } : {}),
    },
    include: {
      leadOfficer: true,
      evidence: { include: { digital: true } },
    },
  });

  const results: SimilarCaseResult[] = [];

  for (const otherCase of allCases) {
    const { matchPercentage, breakdown, hasDuplicateEvidenceAlert } = computePairwiseSimilarity(
      targetCase,
      otherCase,
      config,
    );

    if (matchPercentage >= minScore) {
      results.push({
        caseId: otherCase.caseId,
        title: otherCase.title,
        status: otherCase.status,
        incidentTimestamp: otherCase.incidentTimestamp,
        locationPoint: otherCase.locationPoint,
        leadOfficer: {
          officerId: otherCase.leadOfficer.officerId,
          fullName: otherCase.leadOfficer.fullName,
          badgeNumber: otherCase.leadOfficer.badgeNumber,
          role: otherCase.leadOfficer.role,
        },
        matchPercentage,
        breakdown,
        hasDuplicateEvidenceAlert,
      });
    }
  }

  // Sort descending by match percentage
  results.sort((a, b) => b.matchPercentage - a.matchPercentage);

  return results.slice(0, limit);
}

/**
 * Returns network topology of cases and correlation edges for the cross-case graph.
 */
export async function getCorrelationGraph(
  options: {
    minScore?: number;
    excludeClosed?: boolean;
    config?: SimilarityConfig;
  } = {},
): Promise<CorrelationGraphData> {
  const { minScore = 15, excludeClosed = false, config = DEFAULT_SIMILARITY_CONFIG } = options;

  const cases = await prisma.case.findMany({
    where: {
      ...(excludeClosed ? { status: { notIn: ['closed', 'archived'] } } : {}),
    },
    include: {
      leadOfficer: true,
      evidence: { include: { digital: true } },
    },
    orderBy: { incidentTimestamp: 'desc' },
  });

  const nodes: GraphNode[] = cases.map((c) => ({
    id: c.caseId,
    label: c.title,
    status: c.status,
    locationPoint: c.locationPoint,
    incidentTimestamp: c.incidentTimestamp.toISOString(),
    leadOfficerName: c.leadOfficer.fullName,
    evidenceCount: c.evidence.length,
  }));

  const edges: GraphEdge[] = [];

  for (let i = 0; i < cases.length; i++) {
    for (let j = i + 1; j < cases.length; j++) {
      const caseA = cases[i];
      const caseB = cases[j];

      const { matchPercentage, breakdown } = computePairwiseSimilarity(caseA, caseB, config);

      if (matchPercentage >= minScore) {
        const tags = breakdown
          .filter((b) => b.score > 0.4)
          .map((b) => b.vector.split(' ')[0]);

        edges.push({
          source: caseA.caseId,
          target: caseB.caseId,
          similarity: matchPercentage,
          tags,
        });
      }
    }
  }

  return { nodes, edges };
}
