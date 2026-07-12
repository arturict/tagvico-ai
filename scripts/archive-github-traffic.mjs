import { appendFileSync } from 'node:fs';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repository || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');

async function github(path, { optional = false } = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tagvico-traffic-archive'
    }
  });
  if (!response.ok) {
    if (optional && (response.status === 403 || response.status === 404)) return null;
    throw new Error(`${path}: GitHub returned ${response.status}`);
  }
  return response.json();
}

const [views, clones, referrers, paths, repo] = await Promise.all([
  github('/traffic/views', { optional: true }),
  github('/traffic/clones', { optional: true }),
  github('/traffic/popular/referrers', { optional: true }),
  github('/traffic/popular/paths', { optional: true }),
  github('')
]);

appendFileSync('github-traffic.jsonl', JSON.stringify({
  captured_at: new Date().toISOString(),
  stars: repo.stargazers_count,
  forks: repo.forks_count,
  traffic_available: views !== null && clones !== null,
  views,
  clones,
  referrers,
  popular_paths: paths
}) + '\n');
