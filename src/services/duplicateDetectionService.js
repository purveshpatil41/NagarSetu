const COMMON_STOP_WORDS = new Set([
  'the', 'and', 'with', 'from', 'at', 'on', 'of', 'for', 'in', 'to', 'a', 'an',
  'is', 'are', 'was', 'were', 'there', 'this', 'that', 'large', 'huge', 'big', 'small',
  'issue', 'problem', 'complaint', 'again', 'after', 'storm', 'rain', 'water', 'badly',
  'very', 'more', 'much', 'nearby', 'road', 'street', 'lane', 'main', 'junction', 'chowk', 'market',
  'near', 'opposite', 'beside', 'by', 'gate', 'gaddha', 'damaged', 'damage', 'broken', 'surface'
]);

const ISSUE_KEYWORDS = {
  pothole: ['pothole', 'gaddha', 'hole', 'potholes', 'broken patch', 'surface break', 'deep hole'],
  drainage: ['drainage', 'blocked drain', 'sewer', 'overflow', 'clogged', 'stormwater'],
  garbage: ['garbage', 'waste', 'trash', 'overflowing bin', 'sanitation', 'litter'],
  streetlight: ['street light', 'streetlight', 'pole', 'lighting', 'dark', 'lamp', 'light not working'],
  water: ['water leakage', 'leak', 'pipeline', 'water supply', 'water logging', 'pressure'],
};

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value = '') {
  return normalizeText(value)
    .split(' ')
    .filter((word) => word.length > 1 && !COMMON_STOP_WORDS.has(word));
}

function locationSignature(value = '') {
  const text = normalizeText(value)
    .replace(/\b(pune|mumbai|delhi|bangalore|hyderabad|chennai|ahmedabad|surat|jaipur|kolkata|nagpur|nashik|pimpri|kochi|visakhapatnam|thane|bengaluru|gurugram|gurgaon|city|town|ward|locality)\b/g, ' ')
    .replace(/\b(road|street|lane|main|near|opposite|beside|by|at|junction|chowk|market)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text
    .split(' ')
    .filter((token) => token && token.length > 1)
    .join(' ');
}

function buildDistanceLabel(meters) {
  if (!Number.isFinite(meters)) return 'Unknown distance';
  if (meters < 1000) return `${Math.round(meters)} meters`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function trimToWords(value = '', max = 6) {
  return normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .slice(0, max)
    .join(' ');
}

function getIssueTokens(text = '') {
  const normalized = normalizeText(text);
  const tokens = new Set(tokenize(normalized));

  Object.entries(ISSUE_KEYWORDS).forEach(([group, keywords]) => {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      tokens.add(group);
      keywords.forEach((keyword) => {
        for (const part of normalizeText(keyword).split(' ')) {
          if (part.length > 1) tokens.add(part);
        }
      });
    }
  });

  return [...tokens];
}

function locationOverlapScore(a, b) {
  const left = locationSignature(a).split(' ').filter(Boolean);
  const right = locationSignature(b).split(' ').filter(Boolean);
  if (!left.length || !right.length) return 0;
  if (left.join(' ') === right.join(' ')) return 1;

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const overlap = [...leftSet].filter((word) => rightSet.has(word)).length;
  const sharedWords = overlap / Math.max(left.length, right.length, 1);

  if (left.some((word) => right.includes(word)) || right.some((word) => left.includes(word))) {
    return Math.max(sharedWords, 0.4);
  }

  return 0;
}

function estimateDistanceMeters(complaint, candidate) {
  const complaintCoords = complaint?.coords;
  const candidateCoords = candidate?.coords;
  const locationScore = locationOverlapScore(complaint?.location, candidate?.location);

  if (complaintCoords && candidateCoords && locationScore > 0.3) {
    const toRad = (value) => (value * Math.PI) / 180;
    const earthRadius = 6371e3;
    const dLat = toRad(candidateCoords.latitude - complaintCoords.latitude);
    const dLng = toRad(candidateCoords.longitude - complaintCoords.longitude);
    const lat1 = toRad(complaintCoords.latitude);
    const lat2 = toRad(candidateCoords.latitude);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const meters = earthRadius * c;
    if (meters <= 250 || locationScore >= 0.7) return meters;
  }

  const sigA = locationSignature(complaint?.location);
  const sigB = locationSignature(candidate?.location);
  if (!sigA || !sigB) return Number.POSITIVE_INFINITY;
  if (sigA === sigB) return 180;
  if (sigA.includes(sigB) || sigB.includes(sigA)) return 220;
  if (locationScore <= 0.15) return 2500;
  const overlap = sigA.split(' ').filter((word) => sigB.includes(word)).length;
  return overlap > 0 ? 600 : 2500;
}

function getLocationStrength(complaint, candidate) {
  const locationScore = locationOverlapScore(complaint?.location, candidate?.location);
  const distance = estimateDistanceMeters(complaint, candidate);
  if (!Number.isFinite(distance) || locationScore <= 0.15) return 0;
  if (distance <= 250 || locationScore >= 0.8) return 1;
  if (distance <= 500 || locationScore >= 0.6) return 0.8;
  if (distance <= 1000 || locationScore >= 0.4) return 0.55;
  if (distance <= 1500) return 0.25;
  return 0;
}

function getTimeGapHours(complaint, candidate) {
  if (!complaint?.createdAt || !candidate?.createdAt) return 48;
  return Math.abs(new Date(complaint.createdAt).getTime() - new Date(candidate.createdAt).getTime()) / 3600000;
}

function getIssueStrength(complaint, candidate) {
  const complaintTerms = getIssueTokens(`${complaint?.title || ''} ${complaint?.description || ''}`);
  const candidateTerms = getIssueTokens(`${candidate?.title || ''} ${candidate?.description || ''}`);
  const shared = complaintTerms.filter((term) => candidateTerms.includes(term));
  const issueOverlap = complaintTerms.length && candidateTerms.length ? shared.length / Math.max(complaintTerms.length, candidateTerms.length) : 0;

  const sameCategory = complaint.category && candidate.category && complaint.category === candidate.category ? 1 : 0;
  return Math.max(issueOverlap, sameCategory * 0.7);
}

function getLinkedClusterId(complaint, candidate) {
  if (complaint?.problemClusterId && candidate?.problemClusterId) {
    return complaint.problemClusterId === candidate.problemClusterId ? complaint.problemClusterId : null;
  }
  return complaint?.problemClusterId ?? candidate?.problemClusterId ?? null;
}

function parseClusterId(value) {
  const match = String(value || '').match(/CL-(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function highestClusterNumber(list = []) {
  return list.reduce((max, complaint) => {
    const value = parseClusterId(complaint?.problemClusterId);
    return Math.max(max, value);
  }, 0);
}

function buildClusterId(list = []) {
  const nextNumber = highestClusterNumber(list) + 1;
  return `CL-${String(nextNumber).padStart(4, '0')}`;
}

export function detectDuplicateProblem(complaint, candidates = [], { limit = 3 } = {}) {
  if (!complaint) {
    return {
      isPossibleDuplicate: false,
      similarity: 0,
      relatedComplaints: [],
      problemClusterId: null,
      clusterCount: 0,
      summary: 'No complaint supplied for duplicate review.',
    };
  }

  const safeCandidates = (candidates || []).filter((candidate) => {
    if (!candidate || candidate.id === complaint.id) return false;
    return Boolean(candidate.title || candidate.description || candidate.location);
  });

  if (!safeCandidates.length) {
    return {
      isPossibleDuplicate: false,
      similarity: 0,
      relatedComplaints: [],
      problemClusterId: null,
      clusterCount: 0,
      summary: 'No nearby complaints were available for comparison.',
    };
  }

  const related = safeCandidates
    .map((candidate) => {
      const distanceMeters = estimateDistanceMeters(complaint, candidate);
      const locationStrength = getLocationStrength(complaint, candidate);
      const issueStrength = getIssueStrength(complaint, candidate);
      const hoursGap = getTimeGapHours(complaint, candidate);
      const timeStrength = hoursGap <= 12 ? 1 : hoursGap <= 24 ? 0.8 : hoursGap <= 72 ? 0.45 : 0;
      const sameCategory = complaint.category && candidate.category && complaint.category === candidate.category ? 1 : 0;
      const clusterStrength = getLinkedClusterId(complaint, candidate) ? 1 : 0;

      const similarity =
        sameCategory * 0.25 +
        issueStrength * 0.35 +
        locationStrength * 0.25 +
        timeStrength * 0.1 +
        clusterStrength * 0.05;

      const isPossibleDuplicate =
        similarity >= 0.72 &&
        locationStrength >= 0.25 &&
        (sameCategory === 1 || issueStrength >= 0.3);

      return {
        ...candidate,
        similarity: Number(Math.min(0.99, Math.max(0, similarity)).toFixed(2)),
        distanceMeters,
        distanceLabel: buildDistanceLabel(distanceMeters),
        issueStrength,
        locationStrength,
        timeStrength,
        sameCategory,
        clusterStrength,
        isPossibleDuplicate,
      };
    })
    .filter((candidate) => candidate.isPossibleDuplicate)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  const bestMatch = related[0] ?? null;
  const clusterId = bestMatch?.problemClusterId ?? complaint.problemClusterId ?? null;

  return {
    isPossibleDuplicate: related.length > 0,
    similarity: bestMatch ? bestMatch.similarity : 0,
    relatedComplaints: related,
    problemClusterId: clusterId,
    clusterCount: related.length,
    summary: related.length
      ? 'Possible duplicate complaint detected. Similar reports exist in the same area.'
      : 'No likely duplicate found for this complaint.',
  };
}

export function getProblemDetectionStats(list = []) {
  const grouped = new Map();

  for (const complaint of list) {
    const clusterId = complaint?.problemClusterId || null;
    if (clusterId) {
      if (!grouped.has(clusterId)) grouped.set(clusterId, []);
      grouped.get(clusterId).push(complaint);
    }
  }

  const issueCounts = new Map();

  for (const complaint of list) {
    const issueLabel = complaint?.categoryLabel || complaint?.issueType || 'Road Damage';
    issueCounts.set(issueLabel, (issueCounts.get(issueLabel) ?? 0) + 1);
  }

  const mostReportedIssue = [...issueCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Road Damage';

  return {
    possibleDuplicateGroups: grouped.size,
    activeProblemClusters: grouped.size,
    mostReportedIssue,
  };
}

export function buildProblemClusterSummary(list = []) {
  const clusters = new Map();

  for (const complaint of list) {
    const clusterId = complaint?.problemClusterId || null;
    if (!clusterId) continue;
    if (!clusters.has(clusterId)) clusters.set(clusterId, []);
    clusters.get(clusterId).push(complaint);
  }

  return [...clusters.entries()]
    .map(([clusterId, complaints]) => {
      const issueCounts = new Map();
      const locationCounts = new Map();

      for (const complaint of complaints) {
        const issue = complaint?.categoryLabel || complaint?.issueType || 'Road Damage';
        const location = complaint?.location || 'Unknown location';
        issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
        locationCounts.set(location, (locationCounts.get(location) ?? 0) + 1);
      }

      const mostCommonIssue = [...issueCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Road Damage';
      const location = [...locationCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown location';
      const riskScore = Math.min(99, 55 + complaints.length * 12);
      const priority = riskScore >= 80 ? 'HIGH' : riskScore >= 60 ? 'MEDIUM' : 'LOW';

      return {
        clusterId,
        underlyingProblem: trimToWords(`${mostCommonIssue} ${location}`),
        reports: complaints.length,
        priority,
        location,
        riskScore,
        suggestedAction: riskScore >= 80 ? 'Inspect location within 24 hours' : 'Inspect location within 72 hours',
      };
    })
    .sort((a, b) => b.reports - a.reports);
}

export function hydrateProblemClusters(complaint, allComplaints = []) {
  const result = detectDuplicateProblem(complaint, allComplaints);
  if (!result.isPossibleDuplicate || !result.relatedComplaints.length) {
    return {
      ...complaint,
      problemClusterId: complaint.problemClusterId ?? null,
      duplicateAnalysis: result,
    };
  }

  const clusterId = result.problemClusterId ?? buildClusterId(allComplaints);
  const relatedIds = new Set(result.relatedComplaints.map((item) => item.id));

  return {
    ...complaint,
    problemClusterId: clusterId,
    duplicateAnalysis: {
      ...result,
      problemClusterId: clusterId,
      relatedComplaints: result.relatedComplaints.map((item) => ({
        ...item,
        problemClusterId: clusterId,
      })),
    },
    relatedComplaints: result.relatedComplaints.map((item) => ({
      ...item,
      problemClusterId: clusterId,
    })),
    allComplaints: allComplaints.map((entry) =>
      entry.id === complaint.id || relatedIds.has(entry.id)
        ? { ...entry, problemClusterId: clusterId }
        : entry,
    ),
  };
}
