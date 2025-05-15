import { Job } from "bull";


export async function moveJobToDelayed(job: Job) {
   const farFuture = Date.now() + (365 * 24 * 60 * 60 * 1000); // ~1 year in the future
   const jobState = await (job as any).getState();
   if (jobState === 'active') {
      // Only try moveToDelayed if job is in active state
      await (job as any).moveToDelayed(farFuture, true);
      log.info({ jobId: job.id }, 'Successfully moved job to delayed state for manual handling');
   }
}