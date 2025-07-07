# Design Pattern: The Generic Processor Registry

This document outlines a superior design for handling multiple, similar processors within a Bull queue environment, specifically addressing the challenge of avoiding code duplication while remaining compatible with build tools like `esbuild`.

## 1. The Problem: Code Duplication in Processors

In the current architecture for the `inventory_update` queue, we use Bull's named processors to route jobs to system-specific handlers (e.g., `rexail`, `odoo`).

```typescript
// Current approach in app/queues.ts
inventoryUpdateQueue.process('rexail', './processors/inventory-update/rexail.ts');
inventoryUpdateQueue.process('odoo', './processors/inventory-update/odoo.ts');
```

The problem is that the code inside `rexail.ts` and `odoo.ts` is nearly identical. Both files execute the same sequence of operations (sync catalog, run matching passes, execute update). The only difference is which system-specific modules they import for the sync and update steps. This violates the **Don't Repeat Yourself (DRY)** principle and makes maintenance difficult; a change to the core logic requires editing multiple files.

## 2. The Flawed Solution: Dynamic `import()`

A seemingly elegant solution is to have a single, generic processor that dynamically imports the required modules based on the job name.

```typescript
// Flawed dynamic import approach
export async function genericProcessor(job) {
   const systemName = job.name;
   // !!! THIS WILL FAIL AT RUNTIME !!!
   const system = await import(`../systems/${systemName}/index.ts`);
   
   await system.catalog.sync();
   // ...
}
```

This approach fails because bundlers like `esbuild` work at **build time**. They cannot predict the runtime value of `systemName` and therefore do not know which files (`rexail/index.ts`, `odoo/index.ts`, etc.) to include in the final output bundle. The code would build successfully but throw a "module not found" error at runtime.

## 3. The Superior Solution: The Registry Pattern

The Registry Pattern provides a robust, bundler-friendly solution. It uses **static imports** (which the bundler can see) combined with a **dynamic runtime lookup**.

### How It Works

1.  **Statically Import All Modules**: In a single generic processor file, explicitly import the modules for every supported system.
2.  **Create a Registry**: Store these imported modules in a simple map or object, keyed by the system name.
3.  **Dynamic Lookup at Runtime**: Use the `job.name` to look up the correct module from the registry.

### Example Implementation

#### A. The Generic Processor (`app/processors/inventory-update/index.ts`)

```typescript
// 1. Static imports of all supported system modules
import * as rexail from '../../systems/rexail'; // Assumes rexail/index.ts exports { api, catalog }
import * as odoo from '../../systems/odoo';   // Assumes odoo/index.ts exports { api, catalog }
// To add a new system, you would add its import here.

// 2. A registry mapping system names to their modules
const systemRegistry = {
   rexail,
   odoo,
   // To add a new system, you add one line here.
};

// 3. The single, generic processor function
export async function inventoryUpdateProcessor(job) {
   const systemName = job.name;
   const system = systemRegistry[systemName];

   if (!system) {
      throw new Error(`Unsupported inventory system: ${systemName}`);
   }

   // The rest of the logic is now generic, using the dynamically selected module
   await system.catalog.sync(job.data.storeId);

   // ... run barcodePass, vectorPass, aiPass ...

   await system.api.executeUpdate(job.data.storeId, resolvedItems);
}
```

#### B. Simplified Queue Registration (`app/queues.ts`)

Registration becomes programmatic and clean.

```typescript
import { inventoryUpdateProcessor } from './processors/inventory-update';

// List of supported systems can come from a config file
const supportedSystems = ['rexail', 'odoo']; 

// Register the *same* generic processor for each named job
for (const systemName of supportedSystems) {
   inventoryUpdateQueue.process(systemName, inventoryUpdateProcessor);
}
```

### Benefits of the Registry Pattern

*   **DRY Principle Adhered To**: The core processing logic exists in only one place.
*   **Bundler-Proof**: `esbuild` sees the static `import` statements and correctly includes all necessary modules in the final bundle.
*   **High Maintainability**:
    *   Changing the core workflow requires editing only the single generic processor.
    *   Adding a new system requires creating the system's modules, adding one `import` line, and one line to the `systemRegistry` object. No redundant processor files are needed. 