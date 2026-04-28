import cron from 'node-cron';
import { evaluateAlertsForAllUsers } from '../services/alerts.service';
import { env } from '../config/env';

export function startSchedulers(): void {
  if (!cron.validate(env.alertCron)) {
    // eslint-disable-next-line no-console
    console.warn(`Invalid ALERT_CHECK_CRON "${env.alertCron}", using default */15 * * * *`);
  }
  const expr = cron.validate(env.alertCron) ? env.alertCron : '*/15 * * * *';
  cron.schedule(expr, () => {
    try {
      const created = evaluateAlertsForAllUsers();
      if (created > 0) {
        // eslint-disable-next-line no-console
        console.log(`[alerts] generated ${created} new alert(s)`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[alerts] evaluation failed', e);
    }
  });
}
