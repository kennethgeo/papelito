import 'server-only';
import { dbQuery } from '@/lib/db/client';
import { createPushService } from './delivery';
export { getPushPublicKey, isPushConfigured } from './delivery';
export const { savePushSubscription, removePushSubscription, ownsPushSubscription, notifyUser } = createPushService(dbQuery);
