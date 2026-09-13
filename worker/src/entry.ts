import base from './final';
import { handleRewards } from './rewards';

export default {
  async fetch(req: Request, env: any) {
    const reward = await handleRewards(env, req, (request, innerEnv) => base.fetch(request, innerEnv));
    if (reward) return reward;
    return base.fetch(req, env);
  }
};
