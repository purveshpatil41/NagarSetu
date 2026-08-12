import assert from 'node:assert/strict';

import {
  detectDuplicateProblem,
  getProblemDetectionStats,
  buildProblemClusterSummary,
} from '../src/services/duplicateDetectionService.js';

const makeComplaint = ({
  id,
  title,
  description,
  category = 'pothole',
  location = 'Gate 2, Pune',
  createdAt = new Date().toISOString(),
  coords = { latitude: 18.514, longitude: 73.84 },
  problemClusterId = null,
}) => ({
  id,
  title,
  description,
  category,
  categoryLabel: 'Road Damage',
  location,
  createdAt,
  coords,
  problemClusterId,
  priority: 'high',
});

const now = Date.now();
const minutesAgo = (mins) => new Date(now - mins * 60 * 1000).toISOString();

const similarComplaints = [
  makeComplaint({
    id: 'GRV-101',
    title: 'Pothole near Gate 2',
    description: 'There is a huge pothole near Gate 2 on the road.',
    location: 'Gate 2, Pune',
    createdAt: minutesAgo(180),
  }),
  makeComplaint({
    id: 'GRV-102',
    title: 'Road damaged near Gate 2',
    description: 'Road is damaged near Gate 2 and cars are bumping badly.',
    location: 'Gate 2, Pune',
    createdAt: minutesAgo(110),
  }),
  makeComplaint({
    id: 'GRV-103',
    title: 'Large gaddha on Gate 2 road',
    description: 'There is a big gaddha on the Gate 2 road.',
    location: 'Gate 2, Pune',
    createdAt: minutesAgo(45),
  }),
];

{
  const result = detectDuplicateProblem(
    makeComplaint({
      id: 'GRV-104',
      title: 'Pothole near Gate 2 again',
      description: 'A large pothole is forming near Gate 2 again after rain.',
      location: 'Gate 2, Pune',
      createdAt: minutesAgo(30),
    }),
    similarComplaints,
  );

  assert.equal(result.isPossibleDuplicate, true, 'Should detect similar complaints near the same location.');
  assert.ok(result.relatedComplaints.length >= 2, 'Should identify multiple related complaints.');
  assert.ok(result.similarity >= 0.75, 'Similarity should be high for similar reports.');
}

{
  const result = detectDuplicateProblem(
    makeComplaint({
      id: 'GRV-105',
      title: 'Pothole near Airport Road',
      description: 'There is a pothole near Airport Road and water is collecting there.',
      location: 'Airport Road, Pune',
      createdAt: minutesAgo(20),
    }),
    similarComplaints,
  );

  assert.equal(result.isPossibleDuplicate, false, 'Different locations should not be marked as duplicates.');
}

{
  const result = detectDuplicateProblem(
    makeComplaint({
      id: 'GRV-106',
      title: 'Street light outage',
      description: 'The street light at Gate 2 is not working after the rain.',
      category: 'streetlight',
      location: 'Gate 2, Pune',
      createdAt: minutesAgo(40),
    }),
    similarComplaints,
  );

  assert.equal(result.isPossibleDuplicate, false, 'Unrelated complaints at the same location should not be duplicates.');
}

{
  const clusterComplaint = makeComplaint({
    id: 'GRV-107',
    title: 'Road damage near Gate 2',
    description: 'Road surface is broken near Gate 2 and the lane is uneven.',
    location: 'Gate 2, Pune',
    createdAt: minutesAgo(50),
    problemClusterId: 'CL-1001',
  });

  const result = detectDuplicateProblem(clusterComplaint, [
    { ...clusterComplaint, id: 'GRV-108', problemClusterId: 'CL-1001' },
    { ...clusterComplaint, id: 'GRV-109', problemClusterId: 'CL-1001' },
  ]);

  assert.equal(result.problemClusterId, 'CL-1001', 'Complaint should be linked to the existing problem cluster.');
}

{
  const complaints = [...similarComplaints];
  const result = detectDuplicateProblem(
    makeComplaint({
      id: 'GRV-110',
      title: 'Pothole at Gate 2',
      description: 'Pothole is slowly getting bigger near Gate 2.',
      location: 'Gate 2, Pune',
      createdAt: minutesAgo(15),
    }),
    complaints,
  );

  assert.equal(complaints.length, 3, 'Original complaint list should remain intact and accessible.');
  assert.ok(result.relatedComplaints.length >= 1, 'The duplicate result should still reference existing complaints without deleting them.');
}

{
  const stats = getProblemDetectionStats([
    makeComplaint({ id: 'A1', title: 'Road damage', description: 'Road damage', location: 'Gate 2, Pune', createdAt: minutesAgo(300), problemClusterId: 'CL-1' }),
    makeComplaint({ id: 'A2', title: 'Road damage 2', description: 'Road damage 2', location: 'Gate 2, Pune', createdAt: minutesAgo(240), problemClusterId: 'CL-1' }),
    makeComplaint({ id: 'A3', title: 'Street light issue', description: 'Street light issue', category: 'streetlight', location: 'Gate 2, Pune', createdAt: minutesAgo(120), problemClusterId: 'CL-2' }),
    makeComplaint({ id: 'A4', title: 'Garbage issue', description: 'Garbage overflow', category: 'garbage', location: 'Gate 2, Pune', createdAt: minutesAgo(50), problemClusterId: null }),
  ]);

  assert.equal(stats.possibleDuplicateGroups, 2, 'Duplicate groups should count unique problem clusters.');
  assert.equal(stats.activeProblemClusters, 2, 'Active clusters should be derived from complaint data.');
  assert.equal(stats.mostReportedIssue, 'Road Damage', 'Most reported issue should come from real complaint data.');
}

const clusterSummary = buildProblemClusterSummary([
  makeComplaint({ id: 'B1', title: 'Pothole near Gate 2', description: 'Pothole near Gate 2', location: 'Gate 2', createdAt: minutesAgo(80), problemClusterId: 'CL-2001' }),
  makeComplaint({ id: 'B2', title: 'Road damage near Gate 2', description: 'Road damaged near Gate 2', location: 'Gate 2', createdAt: minutesAgo(60), problemClusterId: 'CL-2001' }),
  makeComplaint({ id: 'B3', title: 'Street light problem', description: 'Street light issue', category: 'streetlight', location: 'Gate 2', createdAt: minutesAgo(35), problemClusterId: 'CL-2002' }),
]);

assert.equal(clusterSummary.length, 2, 'Problem cluster summary should include the actual clusters.');
assert.equal(clusterSummary[0].reports, 2, 'A cluster should count its member complaints from the real data.');

console.log('Duplicate detection tests passed.');
