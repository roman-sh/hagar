/**
 * Simple restart test for Bull.js job recovery
 * 
 * Based on your research, Bull.js has "Automatic recovery from process crashes"
 * BUT with stalledInterval: 0, jobs never get marked as stalled.
 * 
 * This test checks: What happens to active jobs when the worker process restarts?
 * 
 * Run this script, wait for "PROCESSOR CALLED!", then Ctrl+C and run again.
 * If you see "PROCESSOR CALLED!" again = Bull resumes active jobs ✅
 * If you only see "Found existing active job" = Job stays stuck ❌
 */

import Bull from 'bull'

const QUEUE_NAME = 'simple-restart-test'
const queueConfig = {
  settings: {
    stalledInterval: 24 * 60 * 60 * 1000, // 24 hours - effectively "never check" for our test
    // Note: stalledInterval: 0 causes Redis errors in Bull's Lua scripts
  },
  defaultJobOptions: {
    attempts: 1,
  }
}

console.log('🧪 Simple restart test starting...')

const queue = new Bull(QUEUE_NAME, queueConfig)

// Check existing jobs
queue.getJobCounts().then(async counts => {
  console.log(`📊 Job counts:`, counts)
  
  if (counts.active > 0) {
    console.log(`🔍 Found ${counts.active} active job(s) from previous run`)
    console.log(`❓ The key question: Will the processor be called again?`)
  }
  
  // Only add new job if none exist
  if (counts.waiting === 0 && counts.active === 0) {
    console.log('📝 Adding new job...')
    await queue.add('test-job', { 
      message: 'Testing restart behavior',
      timestamp: new Date().toISOString()
    })
  }
})

// Processor with high concurrency like your real app
queue.process(100000, async (job) => {
  console.log(`\n🎯 PROCESSOR CALLED! Job ${job.id} is processing`)
  console.log(`📊 Job data:`, job.data)
  console.log(`⏰ Started at: ${new Date().toISOString()}`)
  console.log(`⏸️  Job will hang forever (simulating manual completion needed)...`)
  
  // Return unresolved promise (job stays active, awaiting manual completion)
  return new Promise(() => {})
})

// Error handlers
queue.on('error', (error) => {
  console.error('❌ Queue error:', error)
})

queue.on('stalled', (job) => {
  console.log(`⚠️  Job ${job.id} stalled (this should never happen with stalledInterval: 0)`)
})

// Wait then tell user to restart
setTimeout(() => {
  console.log(`\n✋ Please restart now! (Ctrl+C then run the script again)`)
  console.log(`\n🧪 TEST HYPOTHESIS:`)
  console.log(`   IF Bull.js has "automatic recovery from process crashes"`)
  console.log(`   THEN you should see "PROCESSOR CALLED!" again after restart`)
  console.log(`   ELSE the job will stay stuck in active state`)
}, 3000) 