import { makeOptimizedTeams } from './family-teams.js?v=10';

self.onmessage = ({ data }) => {
  try {
    const draw = makeOptimizedTeams(data.players, data.count, data.seed, data.links, 6,
      (done, total) => self.postMessage({ progress: { done, total } }));
    self.postMessage({ draw });
  } catch (error) {
    self.postMessage({ error: error.message || 'Simulation impossible.' });
  }
};
