import { Job } from "bull"


export async function moveJobToDelayed(job: Job, delay: number) {
   const jobState = await job.getState()
   if (jobState === 'active') {
      // @ts-ignore - moveToDelayed isn't part of the official Bull Job type definition
      await job.moveToDelayed(Date.now() + delay, true)
   }
}
