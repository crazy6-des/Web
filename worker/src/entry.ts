import base from './final';
import { handleOffers } from './offers';
import { handleRewards } from './rewards';

export default {
  async fetch(req: Request, env: any) {
    const offers = await handleOffers(env, req, (request, innerEnv) => base.fetch(request, innerEnv));
    if (offers) return offers;
    const reward = await handleRewards(env, req, (request, innerEnv) => base.fetch(request, innerEnv));
    if (reward) return reward;
    return base.fetch(req, env);
  }
};
