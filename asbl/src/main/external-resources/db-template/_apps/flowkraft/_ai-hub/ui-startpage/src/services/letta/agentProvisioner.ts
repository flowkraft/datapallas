/**
 * Reference: Implemented with reference to https://github.com/letta-ai/co
 *
 * Note on memory-block mapping and naming:
 * - The reference project exposes a sleeptime archival block `CO_MEMORY_BLOCK` (label `co_memory`).
 * - In this repository we renamed/mapped that intent to `archival_context_policy` (label `archival_context_policy`).
 * - We intentionally conditionally include archival/sleeptime blocks only when `enableSleeptime = true`.
 * - A short doc snippet describing this mapping was added at `docs/memory-blocks.md` for developer clarity.
 */

import getLettaClient from './client';
import { AGENTS } from '../../agents';
import { DB_QUERY_MEMORY_SECTION, TOOL_CALLING_PROTOCOL_BLOCK, getSleepTimeMemoryBlocks, labelAddressingNote } from '../../agents/sharedMemory';
import { Constants } from '../../utils/constants';
import type { AgentState, AgentCreateParams } from '@letta-ai/letta-client/resources/agents';
import type { Tool } from '@letta-ai/letta-client/resources/tools';
import type { Archive } from '@letta-ai/letta-client/resources/archives';
import type { BlockResponse } from '@letta-ai/letta-client/resources/blocks';
import * as fs from 'fs';
import * as path from 'path';

// Matrix provisioning for chat rooms
import {
  provisionMatrixRooms,
  initMatrixConfig,
  type MatrixProvisionResult,
} from '../matrix/matrixProvisioner';

type ProvisionStatus = 'ok' | 'error';
interface ProvisionResult {
  key: string;
  agentId?: string;
  status: ProvisionStatus;
  message?: string;
}

// Block labels whose content is LEARNED by the agents at runtime (as opposed to config-owned
// instruction blocks, which are regenerated from templates on every provision). A force
// recreate captures these values from the outgoing agents and seeds the replacement agents'
// blocks with them, so rebuilding the machinery does not erase the crew's knowledge.
const LEARNED_BLOCK_LABELS = new Set([
  'human',
  'you',
  'tasks',
  'interaction_log',
  'knowledge_structure',
  'subconscious_channel',
  'archival_context',
]);

function normalizeList<T>(resp: unknown): T[] {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp as T[];
  const obj = resp as { items?: T[] } | undefined;
  return obj?.items ?? [];
}

/**
 * Safely format an unknown error for logging and messages.
 */
function formatError(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch (_e) {
    return String(err);
  }
} 

/**
 * Ensure all Letta base tools (memory, archival, conversation, etc.) are registered in the system.
 * This must be called before provisioning agents to ensure tools are available for attachment.
 */
async function ensureBaseToolsRegistered(client: any): Promise<void> {
  try {
    console.log('Registering Letta base tools...');
    // Call the POST /v1/tools/add-base-tools endpoint
    const response = await fetch(`${process.env.LETTA_BASE_URL || 'http://localhost:8283'}/v1/tools/add-base-tools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.LETTA_API_KEY ? { 'Authorization': `Bearer ${process.env.LETTA_API_KEY}` } : {}),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.warn('Failed to register base tools:', error);
      return;
    }

    const tools = await response.json();
    console.log(`Successfully registered ${Array.isArray(tools) ? tools.length : 0} base tools`);
  } catch (err) {
    console.warn('Error registering base tools:', formatError(err));
  }
}

/**
 * Delete the built-in web_search and fetch_webpage tools.
 * These use Letta's hardcoded Exa API implementation and ignore custom source_code.
 * By deleting them, the LLM will only see our better_web_search and better_fetch_webpage tools.
 */
async function deleteBuiltinWebTools(client: any): Promise<void> {
  console.log('Deleting built-in web_search and fetch_webpage tools...');
  
  const baseUrl = process.env.LETTA_BASE_URL || 'http://localhost:8283';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (process.env.LETTA_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.LETTA_API_KEY}`;
  }

  const toolsToDelete = ['web_search', 'fetch_webpage'];
  
  for (const toolName of toolsToDelete) {
    try {
      // Find tool by name
      const listResponse = await fetch(`${baseUrl}/v1/tools?name=${encodeURIComponent(toolName)}`, {
        method: 'GET',
        headers,
      });
      
      if (listResponse.ok) {
        const existingTools = await listResponse.json();
        const toolsList = Array.isArray(existingTools) ? existingTools : (existingTools?.items || []);
        
        for (const tool of toolsList) {
          try {
            const deleteResponse = await fetch(`${baseUrl}/v1/tools/${tool.id}`, {
              method: 'DELETE',
              headers,
            });
            if (deleteResponse.ok) {
              console.log(`  ✓ Deleted built-in tool: ${toolName} (id: ${tool.id})`);
            } else {
              console.warn(`  ⚠ Failed to delete ${toolName}: ${await deleteResponse.text()}`);
            }
          } catch (deleteErr) {
            console.warn(`  ⚠ Error deleting ${toolName}:`, formatError(deleteErr));
          }
        }
      }
    } catch (err) {
      console.warn(`  ⚠ Could not find/delete ${toolName}:`, formatError(err));
    }
  }
  
  console.log('Built-in web tools cleanup complete');
}

/**
 * Ensure custom Python tools from ai-flowstack/custom-tools are registered in Letta.
 * Reads Python source files and registers them via POST /v1/tools endpoint.
 * Throws error if any tool file is missing to prevent silent failures.
 * 
 * @returns Map of tool name -> tool ID for use during agent tool attachment
 */
async function ensureCustomToolsRegistered(client: any): Promise<Map<string, string>> {
  console.log('Registering custom tools from ai-flowstack/custom-tools...');
  
  // Map to store tool name -> tool ID for direct attachment later
  const customToolIds = new Map<string, string>();
  
  const dockerToolsPath = '/custom-tools';
  
  let toolsDir: string | null = null;
  
  // Try Docker path first
  if (fs.existsSync(dockerToolsPath)) {
    toolsDir = dockerToolsPath;
    console.log(`Running in Docker, using path: ${toolsDir}`);
  } else {
    throw new Error(`Custom tools directory not found: ${toolsDir}. Cannot provision agents without required tools.`);
  }
  
  console.log(`Looking for custom tools in: ${toolsDir}`);
  
  // Tool files to register - using "better_" prefixed names to avoid conflicts
  // with Letta's built-in tools (web_search, fetch_webpage).
  // The "better_" tools are custom implementations that Letta won't overwrite.
  const toolFiles = [
    'better_web_search.py',
    'better_fetch_webpage.py',
    'execute_shell_command.py',
    'db_query.py',
  ];

  const baseUrl = process.env.LETTA_BASE_URL || 'http://localhost:8283';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (process.env.LETTA_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.LETTA_API_KEY}`;
  }

  const registeredTools: string[] = [];
  const missingTools: string[] = [];
  const failedTools: string[] = [];
  
  for (const filename of toolFiles) {
    const filePath = path.join(toolsDir, filename);
    const toolName = path.basename(filename, '.py');
    
    // Check if file exists - fail immediately if not
    if (!fs.existsSync(filePath)) {
      missingTools.push(filePath);
      console.error(`❌ Custom tool file NOT FOUND: ${filePath}`);
      continue;
    }

    try {
      const sourceCode = fs.readFileSync(filePath, 'utf-8');
      
      if (!sourceCode || sourceCode.trim().length === 0) {
        throw new Error(`Tool file ${filename} is empty`);
      }
      
      console.log(`  - Registering tool: ${toolName}`);
      
      // Delete ALL existing tools with this name first (both base and custom) for a clean slate.
      // This ensures we always have exactly one tool with our custom implementation.
      try {
        const listResponse = await fetch(`${baseUrl}/v1/tools?name=${encodeURIComponent(toolName)}`, {
          method: 'GET',
          headers,
        });
        
        if (listResponse.ok) {
          const existingTools = await listResponse.json();
          const toolsList = Array.isArray(existingTools) ? existingTools : (existingTools?.items || []);
          
          for (const existingTool of toolsList) {
            console.log(`  - Deleting existing tool ${toolName} (id: ${existingTool.id}, tags: ${(existingTool.tags || []).join(',')})`);
            try {
              const deleteResponse = await fetch(`${baseUrl}/v1/tools/${existingTool.id}`, {
                method: 'DELETE',
                headers,
              });
              if (deleteResponse.ok) {
                console.log(`  ✓ Deleted tool ${toolName} (id: ${existingTool.id})`);
              } else {
                console.warn(`  ⚠ Failed to delete tool ${toolName}: ${await deleteResponse.text()}`);
              }
            } catch (deleteErr) {
              console.warn(`  ⚠ Error deleting tool ${toolName}:`, formatError(deleteErr));
            }
          }
        }
      } catch (listErr) {
        console.warn(`  ⚠ Could not check for existing tool ${toolName}:`, formatError(listErr));
        // Continue with registration attempt anyway
      }
      
      // Create the custom tool fresh using POST (we deleted any existing above)
      const response = await fetch(`${baseUrl}/v1/tools`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_code: sourceCode,
          source_type: 'python'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        failedTools.push(`${toolName}: ${error}`);
        console.error(`❌ Failed to register ${toolName}:`, error);
        continue;
      }

      const result = await response.json();
      const createdToolId = result.id;
      
      // Verify the tool was created with source_code
      const hasSourceCode = !!(result.source_code && result.source_code.trim().length > 0);
      console.log(`  ✓ Created ${toolName} (id: ${createdToolId}, has_source_code: ${hasSourceCode})`);
      
      if (!hasSourceCode) {
        console.warn(`  ⚠ WARNING: Tool ${toolName} was created but source_code was NOT stored by Letta!`);
        console.warn(`    This may happen for known function names. Attempting to update via PATCH...`);
        
        // Try to PATCH the source_code if it wasn't stored
        try {
          const patchSourceResponse = await fetch(`${baseUrl}/v1/tools/${createdToolId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              source_code: sourceCode
            })
          });
          
          if (patchSourceResponse.ok) {
            const patchedTool = await patchSourceResponse.json();
            const nowHasSource = !!(patchedTool.source_code && patchedTool.source_code.trim().length > 0);
            console.log(`  ✓ PATCH result for ${toolName}: has_source_code: ${nowHasSource}`);
            if (!nowHasSource) {
              console.error(`  ❌ CRITICAL: Cannot set source_code for ${toolName} - Letta may not support custom source for this function name`);
            }
          } else {
            console.warn(`  ⚠ PATCH failed for ${toolName}: ${await patchSourceResponse.text()}`);
          }
        } catch (patchErr) {
          console.warn(`  ⚠ Error PATCHing source_code for ${toolName}:`, formatError(patchErr));
        }
      }
      
      // Store the tool ID for direct attachment later
      if (createdToolId) {
        customToolIds.set(toolName, createdToolId);
      }
      
      registeredTools.push(toolName);
      console.log(`  ✓ Successfully registered ${toolName} (id: ${createdToolId || 'unknown'})`);
      
    } catch (fileErr) {
      failedTools.push(`${toolName}: ${formatError(fileErr)}`);
      console.error(`❌ Error processing tool file ${filename}:`, formatError(fileErr));
    }
  }

  // Report results
  console.log(`\nCustom Tools Registration Summary:`);
  console.log(`  ✓ Registered: ${registeredTools.length}/${toolFiles.length}`);
  if (missingTools.length > 0) {
    console.error(`  ❌ Missing files: ${missingTools.length}`);
    missingTools.forEach(f => console.error(`     - ${f}`));
  }
  if (failedTools.length > 0) {
    console.error(`  ❌ Failed: ${failedTools.length}`);
    failedTools.forEach(f => console.error(`     - ${f}`));
  }
  
  // Fail the entire provision if any tools are missing or failed
  if (missingTools.length > 0 || failedTools.length > 0) {
    throw new Error(
      `Custom tool registration failed. Missing: ${missingTools.length}, Failed: ${failedTools.length}. ` +
      `All custom tools must be available to provision agents. Check: ${toolsDir}`
    );
  }
  
  console.log('✓ All custom tools successfully registered\n');
  
  return customToolIds;
}

export async function provisionAllAgents(opts: { force?: boolean; giveDbQueryToolToAthena?: boolean } = {}) {
  const client = getLettaClient();
  const results: ProvisionResult[] = [];
  const force = !!opts.force;
  if (force) {
    console.log('Force provisioning: existing agents matching tags will be deleted before creating new ones');
  }

  // Register Letta BASE tools FIRST (memory, archival, web_search, fetch_webpage, etc.)
  // This creates built-in tools with tool_type=LETTA_BUILTIN (no custom source_code).
  await ensureBaseToolsRegistered(client);
  
  // Delete the built-in web_search and fetch_webpage tools so LLM only sees our better_ versions
  // These built-in tools use hardcoded Exa API and ignore custom source_code
  await deleteBuiltinWebTools(client);
  
  // THEN register our CUSTOM tools with unique names (better_web_search, better_fetch_webpage).
  // These have tool_type=custom which routes to SandboxToolExecutor (uses our source_code).
  const customToolIds = await ensureCustomToolsRegistered(client);

  for (const cfg of AGENTS) {
    console.log('\n=== Provisioning agent:', cfg.key, cfg.displayName);
    try {
      let agentId: string | undefined;
      let agent: AgentState | null = null;

      // Knowledge carried across a force recreate: learned block values keyed by their plain
      // (de-namespaced) label, and the outgoing crew's archive id. Captured from the old
      // agents before deletion, re-applied to the replacement agent further below.
      const preservedBlockValues = new Map<string, string>();
      let preservedArchiveId: string | undefined;

      // Try to find by tag (may return multiple). If force is set, delete all matching agents first.
      try {
        // Find existing agents by metadata.agentKey (do not rely on tag-based lookups)
        const listResp = await client.agents.list({ limit: 100 });
        const allAgents = normalizeList<AgentState>(listResp as unknown);
        // Filter by metadata.agentKey equality
        const agents = allAgents.filter((a) => String((a as any)?.metadata?.agentKey) === String(cfg.key));
        if (agents.length > 0) {
          if (force) {
            // Force recreate rebuilds the MACHINERY (fresh history, config, instruction blocks,
            // tool wiring) but preserves the KNOWLEDGE: learned block values and the archive are
            // captured here and re-applied to the replacement agent below. The old agents' block
            // rows are then deleted so nothing lingers unreachable in Letta's Postgres.
            const toDelete = new Set<string>();
            const blocksToDelete = new Set<string>();

            const retrieveSafe = async (id: string): Promise<any | null> => {
              try {
                return await client.agents.retrieve(id) as any;
              } catch (err) {
                console.warn('Failed to retrieve agent before force delete:', id, formatError(err));
                return null;
              }
            };

            // Collect the agent's block rows for cleanup, its learned values for carry-over,
            // and its recorded archive id (first agent found wins on conflicts).
            const captureFrom = (full: any) => {
              if (!full) return;
              for (const b of (full?.memory?.blocks || []) as Array<any>) {
                if (b?.id) blocksToDelete.add(String(b.id));
                const label = String(b?.label || '');
                const sep = label.indexOf('__');
                const plain = sep >= 0 ? label.slice(sep + 2) : label;
                if (LEARNED_BLOCK_LABELS.has(plain) && !preservedBlockValues.has(plain)) {
                  const v = typeof b?.value === 'string' ? b.value : '';
                  if (v.trim()) preservedBlockValues.set(plain, v);
                }
              }
              if (!preservedArchiveId && full?.metadata?.archiveId) {
                preservedArchiveId = String(full.metadata.archiveId);
              }
            };

            for (const a of agents) {
              toDelete.add(a.id);
              const full = await retrieveSafe(a.id);
              captureFrom(full);

              // Discover the linked sleeptime twin: direct properties first, any agent
              // sharing the first memory block as fallback.
              const twinIds = new Set<string>();
              if (full?.sleeptime_agent_id) twinIds.add(String(full.sleeptime_agent_id));
              const groupIds: string[] = (full?.multi_agent_group as any)?.agent_ids || (full?.managed_group as any)?.agent_ids || [];
              for (const gid of groupIds) if (String(gid) !== String(a.id)) twinIds.add(String(gid));
              const blockId: string | undefined = full?.memory?.blocks?.[0]?.id;
              if (twinIds.size === 0 && blockId) {
                try {
                  const blockAgentsResp = await client.blocks.agents.list(blockId as string);
                  const blockAgents = normalizeList<any>(blockAgentsResp as unknown);
                  for (const ba of blockAgents) {
                    if (ba && ba.id && String(ba.id) !== String(a.id)) twinIds.add(String(ba.id));
                  }
                } catch (err) {
                  console.warn('Failed to list agents for block', blockId, formatError(err));
                }
              }

              for (const tid of Array.from(twinIds)) {
                if (!toDelete.has(tid)) {
                  toDelete.add(tid);
                  console.log('Found linked sleeptime agent (will delete):', tid);
                  captureFrom(await retrieveSafe(tid));
                }
              }
            }

            // Fallback archive discovery by the OLD agent ids (only possible before deletion)
            if (!preservedArchiveId) {
              try {
                const all = normalizeList<Archive>(await client.archives.list() as unknown);
                const oldIds = agents.map((a) => String(a.id));
                const found = all.find((ar) =>
                  oldIds.some(
                    (oid) =>
                      String((ar as any)?.metadata?.fullAgentKey) === `${cfg.key}-${oid}` ||
                      String(ar?.name) === `Agent Archive - ${cfg.key}-${oid}`
                  )
                );
                if (found) preservedArchiveId = String((found as any).id);
              } catch (err) {
                console.warn('Archive fallback lookup failed (force):', formatError(err));
              }
            }

            for (const id of Array.from(toDelete)) {
              try {
                await client.agents.delete(id);
                console.log('Deleted existing agent (force):', id);
              } catch (err) {
                console.warn('Failed to delete existing agent (force):', id, formatError(err));
              }
            }

            // Zombie cleanup: namespaced blocks are independent resources that survive agent
            // deletion. Their learned values are captured above, so the rows themselves can go.
            // The archive is deliberately NOT deleted — it is re-attached to the replacement
            // agent below, preserving all archival passages.
            for (const bId of Array.from(blocksToDelete)) {
              try {
                await (client.blocks as any).delete(bId);
              } catch (err) {
                console.warn('Failed to delete old block (force cleanup):', bId, formatError(err));
              }
            }
            if (blocksToDelete.size > 0) console.log(`Force cleanup: deleted ${blocksToDelete.size} old block row(s)`);
            if (preservedBlockValues.size > 0) console.log('Preserved learned block values:', Array.from(preservedBlockValues.keys()).join(', '));
            if (preservedArchiveId) console.log('Preserved archive for re-attachment:', preservedArchiveId);

            // Deleted existing agents; ensure we create a new one below
            agent = null;
            agentId = undefined;
          } else {
            const found = agents[0];
            agent = found;
            agentId = agent.id;
            console.log('Found existing agent:', agent.id);
          }
        }
      } catch (err) {
        // ignore
      }

      // Create if not found
      if (!agent) {
        console.log('Creating agent...');
        const createPayload: AgentCreateParams = {
          name: cfg.displayName,
          description: cfg.description,
          model: process.env.LLM_MODEL_ID || cfg.model,
          tags: [...(cfg.tags || [])],
          system: cfg.systemPrompt,
          // Keep agentKey in metadata; do not duplicate it inside metadata.tags
          metadata: { agentKey: cfg.key, tags: [...(cfg.tags || [])] },
        }; 
        if (typeof cfg.options?.enableSleeptime === 'boolean') {
          createPayload.enable_sleeptime = cfg.options.enableSleeptime;
        }
        // Ensure embedding is provided for self-hosted Letta instances
        if (cfg.embedding) {
          (createPayload as any).embedding = cfg.embedding;
        }

        agent = await client.agents.create(createPayload as AgentCreateParams) as AgentState;
        agentId = agent.id;

        // Persist a readable unique identifier on the agent metadata for easier discovery
        try {
          const fullAgentKey = `${cfg.key}-${agentId}`;
          const updatedMeta = { ...(agent?.metadata || {}), agentKey: cfg.key, fullAgentKey };
          await (client.agents as any).update(agentId, { metadata: updatedMeta });
          // Refresh agent
          try {
            agent = await client.agents.retrieve(agentId) as any;
          } catch (_e) {}
        } catch (metaErr) {
          console.warn('Failed to persist fullAgentKey in metadata for', agentId, formatError(metaErr));
        }
      }

      // Ensure we have an agentId before proceeding to attachments
      if (!agentId) {
        throw new Error(`Failed to determine agent id for ${cfg.key}`);
      }

      // Ensure agent tags match the local config (sync configured tags)
      try {
        const desiredTags = [...(cfg.tags || [])];
        try {
          console.log('Ensuring agent tags for', agentId, '->', desiredTags);
          // Use the SDK 'update' method to modify agent fields (tags, metadata)
          agent = await (client.agents as any).update(agentId, { tags: desiredTags });

          // Also ensure metadata contains the agent key and a tags fallback for reliable UI lookup
          try {
            // Store a clean metadata.tags fallback (do not include agentKey inside tags)
            const updatedMeta = { ...(agent?.metadata || {}), agentKey: cfg.key, tags: [...(cfg.tags || [])] };
            agent = await (client.agents as any).update(agentId, { metadata: updatedMeta });
            console.log('Updated agent metadata with agentKey and metadata.tags for', agentId);
          } catch (metaErr) {
            console.warn('Failed to update agent metadata:', formatError(metaErr));
          }

          // Skip retrieving relationship details here; tags should be read via the list API when needed.
          console.log('Post-modify: tags/metadata update attempted for', agentId);
        } catch (err) {
          console.warn('Failed to update agent tags:', formatError(err));
        }
      } catch (err) {
        // ignore tagging errors
        console.warn('Error while ensuring tags:', formatError(err));
      }

      // Compare & modify other properties (system, model, enable_sleeptime, embedding, name)
      try {
        const desiredPayload: Record<string, unknown> = {};
        if (agent && typeof cfg.systemPrompt === 'string' && agent.system !== cfg.systemPrompt) desiredPayload.system = cfg.systemPrompt;
        const effectiveModel = process.env.LLM_MODEL_ID || cfg.model;
        if (agent && typeof effectiveModel === 'string' && agent.model !== effectiveModel) desiredPayload.model = effectiveModel;
        if (agent && typeof cfg.displayName === 'string' && agent.name !== cfg.displayName) desiredPayload.name = cfg.displayName;
        if (agent && typeof cfg.options?.enableSleeptime === 'boolean' && agent.enable_sleeptime !== cfg.options?.enableSleeptime)
          desiredPayload.enable_sleeptime = cfg.options.enableSleeptime;
        if (agent && cfg.embedding && agent.embedding !== cfg.embedding) desiredPayload.embedding = cfg.embedding;

        if (Object.keys(desiredPayload).length > 0) {
          console.log('Updating agent properties for', agentId, '->', Object.keys(desiredPayload));
          try {
            agent = await (client.agents as any).update(agentId, desiredPayload);
          } catch (err) {
            console.warn('Failed to update agent properties:', formatError(err));
          }
        }
      } catch (err) {
        console.warn('Error while ensuring agent properties:', formatError(err));
      }

      // Patch the sleeptime companion agent's system prompt with tool_calling_protocol.
      // Letta auto-creates {Name}-sleeptime with a hardcoded prompt that lacks JSON format
      // instructions, causing GLM-4.7 to generate XML tool calls which fail JSON parsing.
      if (cfg.options?.enableSleeptime) {
        try {
          const sleeptimeName = `${cfg.displayName}-sleeptime`;
          const allAgents = normalizeList<AgentState>(await client.agents.list({ limit: 100 as any }) as unknown);
          const sleeptimeAgent = allAgents.find((a: any) => a.name === sleeptimeName);
          if (sleeptimeAgent) {
            const hasTcp = sleeptimeAgent.system?.includes('tool_calling_protocol');
            if (!hasTcp) {
              const patchedSystem = TOOL_CALLING_PROTOCOL_BLOCK.trim() + '\n\n' + (sleeptimeAgent.system || '');
              await (client.agents as any).update(sleeptimeAgent.id, { system: patchedSystem });
              console.log('Patched sleeptime agent system prompt with tool_calling_protocol:', sleeptimeAgent.id);
            } else {
              console.log('Sleeptime agent already has tool_calling_protocol:', sleeptimeAgent.id);
            }
          } else {
            console.warn('Sleeptime companion agent not found:', sleeptimeName);
          }
        } catch (err) {
          console.warn('Failed to patch sleeptime agent system prompt:', formatError(err));
        }
      }

      // Create memory blocks (use per-agent blocks by default; shared subset will still be shared but names are namespaced by agent)
      // Only these blocks are shared between main agent and sleeptime agent
      // sleeptime_identity, sleeptime_procedures, archival_context_policy are sleeptime-only
      const SHARED_BLOCK_LABELS = new Set([
        'subconscious_channel',
        'archival_context',
      ]);

      // baseKey is the human-readable unique prefix used for all resources for this agent
      // For block labels we shorten the agent id to avoid exceeding label length limits
      // Use a short agent id for label generation but keep the full agent id in metadata
      const baseKey = `${cfg.key}-${agentId}`;
      const shortAgent = String(agentId).slice(0, Constants.SHORT_AGENT_ID_LEN);
      const labelPrefix = `${cfg.key}-${shortAgent}`; // used for block labels (keeps labels <= Constants.BLOCK_LABEL_MAX)

      // memory_management instructs the primary agent to edit blocks by plain name (human,
      // you, tasks, …) while the attached labels are namespaced — append this agent's concrete
      // prefix so memory-tool calls use the full label on the first try. Deterministic per
      // agent, so the reconcile below stays stable across re-provisions.
      // Learned values captured from force-deleted predecessors (preservedBlockValues) seed
      // the replacement's blocks, so the crew keeps what it knew across a force recreate.
      const memoryBlocks = (cfg.memoryBlocks || []).map((mb) => {
        if (mb.label === 'memory_management') {
          return { ...mb, value: (mb.value || '') + labelAddressingNote(labelPrefix) };
        }
        const preserved = preservedBlockValues.get(String(mb.label));
        return preserved !== undefined ? { ...mb, value: preserved } : mb;
      });

      for (const mb of memoryBlocks) {
        try {
          // Refresh agent state to check current attachments
          try {
            const refreshedAgent = await client.agents.retrieve(agentId) as any;
            agent = refreshedAgent;
          } catch (retrieveErr) {
            console.warn('Failed to retrieve agent while checking attached blocks for', agentId || 'unknown', formatError(retrieveErr));
          }

          // Build short namespaced label for all blocks: <agentKey>-<shortAgentId>__<label>
          // Truncate label suffix part if it would exceed Constants.BLOCK_LABEL_MAX
          let targetLabel = `${labelPrefix}__${String(mb.label)}`;
          if (targetLabel.length > Constants.BLOCK_LABEL_MAX) {
            const prefixLen = `${labelPrefix}__`.length;
            const allowed = Math.max(0, Constants.BLOCK_LABEL_MAX - prefixLen);
            const truncated = String(mb.label).slice(0, allowed);
            targetLabel = `${labelPrefix}__${truncated}`;
            console.warn('Truncated block label to fit max length:', targetLabel);
          }

          const agentBlocks = (agent?.memory?.blocks || []) as Array<any>;
          const alreadyAttached = agentBlocks.some((b) => String(b?.label) === targetLabel);
          if (alreadyAttached) {
            console.log('Block already attached to agent, skipping:', targetLabel);
            continue;
          }

          // Try to find an existing global block with the computed label and prefer owner metadata
          let blockToUse: BlockResponse | null = null;
          try {
            // List a handful of blocks with this label (should normally be 0 or 1)
            const blocksResp = await client.blocks.list({ label: targetLabel, limit: 10 as any });
            const found = normalizeList<BlockResponse>(blocksResp as unknown);

            // Prefer blocks explicitly owned by this agent via metadata.ownerFullAgentKey (stronger match)
            const owned = found.find(b => String((b as any)?.metadata?.ownerFullAgentKey) === baseKey);
            blockToUse = (owned || found[0]) ?? null;

            // If we found a block, ensure its metadata and content match our config.
            if (blockToUse) {
              // Ensure ownership metadata exists and points to this agent
              try {
                const currentMeta = (blockToUse as any)?.metadata || {};
                if (currentMeta.ownerFullAgentKey !== baseKey && blockToUse) {
                  const newMeta: any = { ...currentMeta, ownerFullAgentKey: baseKey };
                  if (SHARED_BLOCK_LABELS.has(String(mb.label))) {
                    newMeta.sharedOwners = Array.from(new Set([...(currentMeta?.sharedOwners || []), baseKey]));
                  }
                  try {
                    // Persist owner metadata for easier discovery and to prevent accidental reuse
                    const bId = blockToUse.id;
                    await (client.blocks as any).update(bId, { metadata: newMeta });
                    console.log('Updated block metadata owner for', targetLabel);
                    // Refresh block to pick up changes
                    try { blockToUse = await client.blocks.retrieve(bId) as any; } catch (_e) {}
                  } catch (metaErr) {
                    console.warn('Failed to update block metadata for', targetLabel, formatError(metaErr));
                  }
                }
              } catch (_e) {
                // ignore metadata reconciliation errors
              }

              // Reconcile content (value/description/limit) with local config and update if different
              try {
                const desired: Record<string, unknown> = {};
                if ((blockToUse as any).value !== (mb.value || '')) desired.value = mb.value || '';
                if ((blockToUse as any).description !== (mb.description || '')) desired.description = mb.description || '';
                if (((blockToUse as any).limit ?? undefined) !== (mb.limit ?? undefined)) desired.limit = mb.limit;
                if (Object.keys(desired).length > 0 && blockToUse) {
                  try {
                    const bId = blockToUse.id;
                    await (client.blocks as any).update(bId, desired);
                    console.log('Updated existing block to match config:', targetLabel);
                    try { blockToUse = await client.blocks.retrieve(bId) as any; } catch (_e) {}
                  } catch (updateErr) {
                    console.warn('Failed to update existing block content for', targetLabel, formatError(updateErr));
                  }
                }
              } catch (_e) {
                // ignore reconciliation errors
              }
            }
          } catch (listErr) {
            console.warn('Failed to list global blocks by label', targetLabel, formatError(listErr));
          }

          // If still no block was found, create a new one and persist owner metadata upfront
          if (!blockToUse) {
            try {
              const createMeta: any = { ownerFullAgentKey: baseKey };
              if (SHARED_BLOCK_LABELS.has(String(mb.label))) createMeta.sharedOwners = [baseKey];
              blockToUse = await client.blocks.create({ label: targetLabel, value: mb.value || '', description: mb.description || '', limit: mb.limit, metadata: createMeta }) as BlockResponse;
            } catch (err) {
              console.warn('Failed to create block (maybe exists):', targetLabel, formatError(err));
              // Attempt to find it again and prefer an owned one
              try {
                const blocksResp2 = await client.blocks.list({ label: targetLabel, limit: 10 as any });
                const found2 = normalizeList<BlockResponse>(blocksResp2 as unknown);
                const owned2 = found2.find(b => String((b as any)?.metadata?.ownerFullAgentKey) === baseKey);
                blockToUse = (owned2 || found2[0]) ?? null;
              } catch (list2Err) {
                console.warn('Failed to list blocks in fallback for', targetLabel, formatError(list2Err));
              }
            }
          }

          if (!blockToUse) {
            console.warn('Unable to create or find block:', targetLabel);
            continue;
          }

          // Attach the block if it's not already attached
          try {
            await client.agents.blocks.attach(blockToUse.id, { agent_id: agentId });
            console.log('Created & attached block', targetLabel);
            // refresh agent reference to include the newly attached block
            try {
              agent = await client.agents.retrieve(agentId) as any;
            } catch (refreshErr) {
              console.warn('Failed to refresh agent after block attach:', agentId, formatError(refreshErr));
            }
          } catch (err: any) {
            // If server returns a duplicate / 409, it's benign - another process attached the same label
            const detail = err?.detail || err?.message || '';
            if (/(unique|duplicate|409)/i.test(String(detail))) {
              console.log('Block already attached (detected by server), skipping:', targetLabel);
            } else {
              console.warn('Failed to attach block to agent (maybe already attached):', formatError(err));
            }
          }
        } catch (err) {
          console.warn('Unexpected error while ensuring block exists/attached:', mb.label, formatError(err));
        }
      }

      // Attach tools
      // For custom tools (better_web_search, better_fetch_webpage, execute_shell_command), use cached IDs from registration
      // These use unique names to avoid conflicts with Letta's built-in tools
      const CUSTOM_TOOL_NAMES = ['better_web_search', 'better_fetch_webpage', 'execute_shell_command', 'db_query'];
      
      // First, get the agent's currently attached tools so we can detach old versions
      let agentCurrentTools: any[] = [];
      try {
        const refreshedAgent = await client.agents.retrieve(agentId) as any;
        agentCurrentTools = refreshedAgent?.tools || [];
      } catch (err) {
        console.warn('Could not retrieve agent tools for cleanup:', formatError(err));
      }
      
      for (const t of cfg.tools || []) {
        try {
          let toolId: string | null = null;
          let toolTags: string = 'none';
          
          if (CUSTOM_TOOL_NAMES.includes(t.name)) {
            // For custom tools, use the cached ID from registration directly
            // This ensures we always use our custom implementation with source_code
            const cachedToolId = customToolIds.get(t.name);
            
            if (cachedToolId) {
              // First, detach ANY tool with this name currently attached to the agent
              // This ensures we remove old/stale tool references before attaching the new one
              for (const agentTool of agentCurrentTools) {
                if (agentTool.name === t.name) {
                  try {
                    await client.agents.tools.detach(agentTool.id, { agent_id: agentId });
                    console.log(`Detached old tool ${t.name} (id: ${agentTool.id}) from agent`);
                  } catch (detachErr) {
                    // Tool may already be detached or not exist - this is fine
                    console.log(`Could not detach tool ${t.name} (may not be attached): ${formatError(detachErr)}`);
                  }
                }
              }
              
              toolId = cachedToolId;
              toolTags = 'custom, ai-flowstack';
              console.log(`Using cached custom tool ID for ${t.name}: ${toolId}`);
            } else {
              // Fallback: query by name if somehow not in cache (shouldn't happen)
              console.warn(`Custom tool ${t.name} not found in cache, falling back to name lookup`);
              const toolsResp = await client.tools.list({ name: t.name });
              const tools = normalizeList<Tool>(toolsResp as unknown);
              
              // Use the first tool found - we already deleted/recreated it during registration
              // so there should only be one with our source code
              if (tools.length > 0) {
                toolId = tools[0].id;
                toolTags = (tools[0] as any).tags?.join(', ') || 'none';
              }
            }
          } else {
            // For non-custom tools (letta_core, letta_builtin), query by name
            const toolsResp = await client.tools.list({ name: t.name });
            const tools = normalizeList<Tool>(toolsResp as unknown);
            if (tools.length > 0) {
              toolId = tools[0].id;
              toolTags = (tools[0] as any).tags?.join(', ') || 'none';
            }
          }
          
          if (toolId) {
            try {
              await client.agents.tools.attach(toolId, { agent_id: agentId });
              console.log(`Attached tool ${t.name} (tags: ${toolTags}) -> agent`);
            } catch (err) {
              console.warn('Failed to attach tool to agent:', formatError(err));
            }
          } else {
            console.warn('Tool not found in platform (skipping attach):', t.name);
          }
        } catch (err) {
          console.warn('Error while attaching tool', t.name, formatError(err));
        }
      }

      // db_query tool: conditionally attach/detach for Athena only
      if (cfg.key === 'athena') {
        const dbQueryToolId = customToolIds.get('db_query');
        if (opts.giveDbQueryToolToAthena && dbQueryToolId) {
          // Attach db_query to Athena
          try {
            await client.agents.tools.attach(dbQueryToolId, { agent_id: agentId });
            console.log('Attached db_query tool to Athena');
          } catch (err) {
            console.warn('Failed to attach db_query to Athena:', formatError(err));
          }
        } else if (!opts.giveDbQueryToolToAthena) {
          // Detach db_query from Athena if currently attached
          try {
            const refreshed = await client.agents.retrieve(agentId) as any;
            const currentTools = refreshed?.tools || [];
            const dbQueryTool = currentTools.find((t: any) => t.name === 'db_query');
            if (dbQueryTool) {
              await client.agents.tools.detach(dbQueryTool.id, { agent_id: agentId });
              console.log('Detached db_query tool from Athena');
            }
          } catch (err) {
            console.warn('Failed to detach db_query from Athena:', formatError(err));
          }
        }

        // Update Athena's available_linux_utilities memory block to match the toggle
        // Inject db_query docs when enabled, strip them when disabled
        try {
          const utilsLabel = `${labelPrefix}__available_linux_utilities`;
          const blocksResp = await client.blocks.list({ label: utilsLabel, limit: 5 as any });
          const utilsBlocks = normalizeList<BlockResponse>(blocksResp as unknown);
          const utilsBlock = utilsBlocks[0] ?? null;
          if (utilsBlock) {
            const currentValue = (utilsBlock as any).value || '';
            const hasDbQuerySection = currentValue.includes('**Database Querying**');
            if (opts.giveDbQueryToolToAthena && !hasDbQuerySection) {
              // Insert db_query section before **Version Control**
              const insertionPoint = '**Version Control**';
              const updatedValue = currentValue.includes(insertionPoint)
                ? currentValue.replace(insertionPoint, DB_QUERY_MEMORY_SECTION + insertionPoint)
                : currentValue + DB_QUERY_MEMORY_SECTION;
              await (client.blocks as any).update(utilsBlock.id, { value: updatedValue });
              console.log('Injected db_query docs into Athena available_linux_utilities block');
            } else if (!opts.giveDbQueryToolToAthena && hasDbQuerySection) {
              // Strip the db_query section
              const updatedValue = currentValue.replace(DB_QUERY_MEMORY_SECTION, '');
              await (client.blocks as any).update(utilsBlock.id, { value: updatedValue });
              console.log('Stripped db_query docs from Athena available_linux_utilities block');
            }
          }
        } catch (err) {
          console.warn('Failed to update Athena available_linux_utilities block:', formatError(err));
        }
      }

      // Create / attach shared archive (namespaced by agentKey-agentId)
      // Prefer metadata-based lookup using fullAgentKey / ownerFullAgentKey to avoid ambiguous name matches
      const archiveFullKey = baseKey; // e.g. `${cfg.key}-${agentId}`
      const archiveName = `Agent Archive - ${cfg.key}-${agentId}`;

      let archive: Archive | undefined;
      // A force recreate carries the outgoing crew's archive across: re-attach it to the
      // replacement agent instead of creating a fresh one, so all archival passages survive.
      if (preservedArchiveId) {
        try {
          archive = await client.archives.retrieve(preservedArchiveId) as Archive;
          console.log('Re-using preserved archive:', preservedArchiveId);
        } catch (err) {
          console.warn('Preserved archive not retrievable, falling back to lookup/create:', preservedArchiveId, formatError(err));
        }
      }
      if (!archive) {
        try {
          const list = await client.archives.list();
          const archives = normalizeList<Archive>(list as unknown);
          // Prefer archives with explicit metadata.fullAgentKey, otherwise fall back to name
          archive = archives.find(a => String((a as any)?.metadata?.fullAgentKey) === archiveFullKey) || archives.find(a => a.name === archiveName);
        } catch (err) {
          // ignore list failures; we'll try to create
        }
      }

      if (!archive) {
        try {
          // Create archive and persist fullAgentKey + owner metadata to make future lookups efficient
          const createdArchive = await client.archives.create({ name: archiveName, description: `Shared archival memory for ${cfg.key}`, embedding: cfg.embedding }) as Archive;
          archive = createdArchive;
          console.log('Created archive:', createdArchive.id);

          // Server may not persist archive.metadata reliably; instead record archive mapping on the agent metadata
          try {
            const updatedMeta = { ...(agent?.metadata || {}), archiveId: createdArchive.id, archiveName: createdArchive.name, archiveFullKey };
            await (client.agents as any).update(agentId, { metadata: updatedMeta });
            console.log('Recorded archive mapping on agent metadata for', agentId);
            try { agent = await client.agents.retrieve(agentId) as any; } catch (_e) {}
          } catch (metaErr) {
            console.warn('Failed to update agent metadata with archive mapping:', formatError(metaErr));
          }
        } catch (err) {
          console.warn('Failed to create archive (maybe not supported in SDK):', formatError(err));
        }
      } else {
        // Archive metadata is not reliably supported by the server; store mapping on the agent instead
        try {
          const updatedMeta = { ...(agent?.metadata || {}), archiveId: archive.id, archiveName: archive.name, archiveFullKey };
          try {
            await (client.agents as any).update(agentId, { metadata: updatedMeta });
            console.log('Recorded archive mapping on agent metadata for', agentId);
            try { agent = await client.agents.retrieve(agentId) as any; } catch (_e) {}
          } catch (updateErr) {
            console.warn('Failed to update agent metadata with archive mapping:', formatError(updateErr));
          }
        } catch (_e) {
          // ignore
        }
      }

      if (archive) {
        // Attach archive to agent.
        // Note: The Letta SDK only provides attach/detach for agent archives - no list endpoint exists.
        // We trust the attach succeeded if no error is thrown, and store the mapping in agent metadata.
        try {
          const archiveIdRef = (archive as any)?.id;
          if (archiveIdRef) {
            try {
              await client.agents.archives.attach(archiveIdRef, { agent_id: agentId });
              console.log(`Attached archive ${archiveIdRef} to agent ${agentId}`);
            } catch (attachErr: any) {
              // Check if it's an "already attached" error (409 or similar) - this is benign
              const errStr = formatError(attachErr);
              if (/already|duplicate|409|attached/i.test(errStr)) {
                console.log(`Archive ${archiveIdRef} already attached to agent ${agentId}`);
              } else {
                console.warn(`Failed to attach archive ${archiveIdRef} to agent:`, errStr);
              }
            }
          }
          
          // Always update agent metadata with archive mapping for reliable discovery
          try {
            const updatedMeta = { ...(agent?.metadata || {}), archiveId: archive.id, archiveName: archive.name, archiveFullKey };
            await (client.agents as any).update(agentId, { metadata: updatedMeta });
            console.log('Recorded archive mapping in agent metadata for', agentId);
            try { agent = await client.agents.retrieve(agentId) as any; } catch (_e) {}
          } catch (metaErr) {
            console.warn('Failed to update agent metadata with archive mapping:', formatError(metaErr));
          }
        } catch (err) {
          console.warn('Unexpected error during archive attachment:', formatError(err));
        }

        // If sleeptime is enabled, attempt to discover the sleeptime agent that
        // shares the same memory block and attach the archive and sleeptime-only
        // blocks/tools to it (mirrors ai-letta-co behavior for Co/Ada)
        try {
          if (cfg.options?.enableSleeptime) {
            // Refresh agent to get up-to-date group/sleeptime info
            let fullAgent: any = null;
            try {
              fullAgent = await client.agents.retrieve(agentId) as any;
            } catch (retrieveErr) {
              console.warn('Failed to retrieve full agent for sleeptime discovery:', agentId, formatError(retrieveErr));
            }

            // Preferred direct properties
            let sleeptimeAgentId: string | undefined = (fullAgent?.sleeptime_agent_id as string) || (fullAgent?.multi_agent_group as any)?.agent_ids?.find((id: string) => id !== agentId) || (fullAgent?.managed_group as any)?.agent_ids?.find((id: string) => id !== agentId);

            // We no longer attempt to find sleeptime agents by only agentKey (not unique enough).
            // Instead we rely on namespaced shared block detection below which uses both agentKey and agentId.

            // As a last resort, find agents that share the expected namespaced subconscious_channel block
            if (!sleeptimeAgentId) {
              try {
                // Use short-agent-based label to find the shared subconscious_channel
                const expectedSharedLabel = `${labelPrefix}__subconscious_channel`;
                const blocksResp = await client.blocks.list({ label: expectedSharedLabel, limit: 1 as any });
                const found = normalizeList<BlockResponse>(blocksResp as unknown);
                const blockId = found && found[0] ? found[0].id : undefined;
                if (blockId) {
                  const blockAgentsResp = await client.blocks.agents.list(blockId as string);
                  const blockAgents = normalizeList<any>(blockAgentsResp as unknown);
                  const foundSleeptime = blockAgents.find((a: any) => a.id !== agentId);
                  if (foundSleeptime) sleeptimeAgentId = foundSleeptime.id;
                }
              } catch (err) {
                // ignore
              }
            }

            if (sleeptimeAgentId) {
              console.log('Found sleeptime agent for', agentId, '->', sleeptimeAgentId);

              // Ensure sleeptime agent metadata has readable agentKey and fullAgentKey
              try {
                const sleeptimeFullAgentKey = `${cfg.key}-sleeptime-${sleeptimeAgentId}`;
                const primaryFullAgentKey = `${cfg.key}-${agentId}`;
                const current = await client.agents.retrieve(sleeptimeAgentId) as any;
                const updatedMeta = { ...(current?.metadata || {}), agentKey: `${cfg.key}-sleeptime`, fullAgentKey: sleeptimeFullAgentKey, primaryFullAgentKey };
                try {
                  await (client.agents as any).update(sleeptimeAgentId, { metadata: updatedMeta });
                } catch (updateErr) {
                  console.warn('Failed to update sleeptime agent metadata:', formatError(updateErr));
                }
              } catch (err) {
                console.warn('Failed to ensure sleeptime agent metadata:', formatError(err));
              }

              // Attach the shared archive to the sleeptime agent as well
              // Note: The Letta SDK only provides attach/detach for agent archives - no list endpoint exists.
              try {
                const archiveIdRef = (archive as any)?.id;
                if (archiveIdRef) {
                  try {
                    await client.agents.archives.attach(archiveIdRef, { agent_id: sleeptimeAgentId });
                    console.log(`Attached archive ${archiveIdRef} to sleeptime agent ${sleeptimeAgentId}`);
                  } catch (attachErr: any) {
                    const errStr = formatError(attachErr);
                    if (/already|duplicate|409|attached/i.test(errStr)) {
                      console.log(`Archive ${archiveIdRef} already attached to sleeptime agent ${sleeptimeAgentId}`);
                    } else {
                      console.warn(`Failed to attach archive to sleeptime agent:`, errStr);
                    }
                  }
                }

                // Record archive mapping on the sleeptime agent metadata
                try {
                  const currentSleeptime = await client.agents.retrieve(sleeptimeAgentId) as any;
                  const updatedSleeptimeMeta = { ...(currentSleeptime?.metadata || {}), archiveId: archive.id, archiveName: archive.name, primaryArchiveFullKey: archiveFullKey };
                  await (client.agents as any).update(sleeptimeAgentId, { metadata: updatedSleeptimeMeta });
                  console.log('Recorded archive mapping on sleeptime agent metadata for', sleeptimeAgentId);
                } catch (metaErr) {
                  console.warn('Failed to update sleeptime agent metadata with archive mapping:', formatError(metaErr));
                }
              } catch (err) {
                console.warn('Unexpected error attaching archive to sleeptime agent:', formatError(err));
              }


              // Ensure namespaced sleeptime-only blocks exist on the sleeptime agent
              // Note: subconscious_channel and archival_context are SHARED (attached via main agent)
              // These are sleeptime-ONLY blocks (NO sharedOwners - they belong only to sleeptime agent).
              // Full protocol definitions (identity / procedures / archival policy) come from
              // sharedMemory, addressed to this agent by name and carrying this agent's concrete
              // block-label prefix (so memory-tool calls use the full namespaced labels on the
              // first try). The reconcile below keeps existing blocks in sync with these
              // definitions, so a plain (non-force) re-provision also updates provisioned crews.
              const requiredSleeptimeBlocks = getSleepTimeMemoryBlocks(cfg.displayName, labelPrefix);

              // Define keys for metadata
              const primaryFullAgentKey = `${cfg.key}-${agentId}`;
              const sleeptimeFullAgentKey = `${cfg.key}-sleeptime-${sleeptimeAgentId}`;

              // FIRST: Update the SHARED blocks (subconscious_channel, archival_context) to include sleeptime agent in sharedOwners
              // These blocks were created during main agent provisioning but we didn't know sleeptime agent ID yet
              for (const sharedLabel of ['subconscious_channel', 'archival_context']) {
                try {
                  const sharedBlockLabel = `${labelPrefix}__${sharedLabel}`;
                  const blocksResp = await client.blocks.list({ label: sharedBlockLabel, limit: 10 as any });
                  const blocks = normalizeList<BlockResponse>(blocksResp as unknown);
                  const sharedBlock = blocks.find(x => String((x as any)?.metadata?.ownerFullAgentKey) === baseKey) || blocks[0] || null;
                  
                  if (sharedBlock) {
                    const currentMeta = (sharedBlock as any)?.metadata || {};
                    const existingOwners = Array.isArray(currentMeta?.sharedOwners) ? currentMeta.sharedOwners : [];
                    
                    // Add both primary and sleeptime agent keys to sharedOwners
                    const updatedOwners = Array.from(new Set([...existingOwners, primaryFullAgentKey, sleeptimeFullAgentKey]));
                    
                    if (JSON.stringify(updatedOwners) !== JSON.stringify(existingOwners)) {
                      await (client.blocks as any).update(sharedBlock.id, { 
                        metadata: { ...currentMeta, sharedOwners: updatedOwners } 
                      });
                      console.log(`Updated shared block ${sharedBlockLabel} sharedOwners to include sleeptime agent`);
                    }
                  }
                } catch (err) {
                  console.warn(`Failed to update sharedOwners for ${sharedLabel}:`, formatError(err));
                }
              }

              // THEN: Create/attach sleeptime-ONLY blocks (these do NOT get sharedOwners)
              for (const b of requiredSleeptimeBlocks) {
                // Namespaced label shared between primary and sleeptime agent (uses short agent id to respect label length limits)
                let targetLabel = `${labelPrefix}__${b.label}`;
                if (targetLabel.length > Constants.BLOCK_LABEL_MAX) {
                  const prefixLen = `${labelPrefix}__`.length;
                  const allowed = Math.max(0, Constants.BLOCK_LABEL_MAX - prefixLen);
                  const truncated = String(b.label).slice(0, allowed);
                  targetLabel = `${labelPrefix}__${truncated}`;
                  console.warn('Truncated sleeptime block label to fit max length:', targetLabel);
                }

                // Try to find an existing namespaced block; prefer blocks that explicitly declare ownership
                let sb: BlockResponse | null = null;
                try {
                  const blocksResp = await client.blocks.list({ label: targetLabel, limit: 10 as any });
                  const blocks = normalizeList<BlockResponse>(blocksResp as unknown);
                  // Prefer explicitly owned block; fall back to first match, otherwise null
                  sb = blocks.find(x => String((x as any)?.metadata?.ownerFullAgentKey) === baseKey) || blocks[0] || null;

                  // If found, reconcile metadata and content with config
                  if (sb) {
                    try {
                      const currentMeta = (sb as any)?.metadata || {};
                      if (currentMeta.ownerFullAgentKey !== baseKey && sb) {
                        const updated = { ...currentMeta, ownerFullAgentKey: baseKey };
                        try {
                          const sbId = sb.id;
                          await (client.blocks as any).update(sbId, { metadata: updated });
                          console.log('Updated sleeptime block metadata owner for', targetLabel);
                          try { sb = await client.blocks.retrieve(sbId) as any; } catch (_e) {}
                        } catch (metaErr) {
                          console.warn('Failed to update sleeptime block metadata:', formatError(metaErr));
                        }
                      }
                    } catch (_e) {}

                    // Reconcile values/description/limit
                    try {
                      const desired: Record<string, unknown> = {};
                      if ((sb as any).value !== (b.value || '')) desired.value = b.value || '';
                      if ((sb as any).description !== (b.description || '')) desired.description = b.description || '';
                      if (((sb as any).limit ?? undefined) !== (b.limit ?? undefined)) desired.limit = b.limit;
                      if (Object.keys(desired).length > 0 && sb) {
                        try {
                          const sbId = sb.id;
                          await (client.blocks as any).update(sbId, desired);
                          console.log('Updated existing sleeptime block to match config:', targetLabel);
                          try { sb = await client.blocks.retrieve(sbId) as any; } catch (_e) {}
                        } catch (updateErr) {
                          console.warn('Failed to update existing sleeptime block content for', targetLabel, formatError(updateErr));
                        }
                      }
                    } catch (_e) {}
                  }
                } catch (lookupErr) {
                  console.warn('Failed to lookup sleeptime block by label', targetLabel, formatError(lookupErr));
                }

                // If not found, create it (sleeptime-only blocks do NOT get sharedOwners)
                if (!sb) {
                  try {
                    // Sleeptime-only blocks: no sharedOwners since they're not shared with main agent
                    sb = await client.blocks.create({ label: targetLabel, value: b.value || '', description: b.description || '', limit: b.limit, metadata: { ownerFullAgentKey: baseKey } }) as BlockResponse;
                    console.log('Created sleeptime-only block', targetLabel);
                  } catch (createErr) {
                    console.warn('Failed to create sleeptime block', targetLabel, formatError(createErr));
                    // Try to find any block as a fallback
                    try {
                      const blocksResp2 = await client.blocks.list({ label: targetLabel, limit: 10 as any });
                      const blocks2 = normalizeList<BlockResponse>(blocksResp2 as unknown);
                        // Prefer explicitly owned block; fall back to first match, otherwise null
                        sb = blocks2.find(x => String((x as any)?.metadata?.ownerFullAgentKey) === baseKey) || blocks2[0] || null;
                    } catch (fallbackErr) {
                      console.warn('Fallback lookup failed for sleeptime block', targetLabel, formatError(fallbackErr));
                    }
                  }
                }

                // Sleeptime-only blocks: ensure NO sharedOwners (they're not shared with main agent)
                // Just ensure ownership metadata is correct and attach to sleeptime agent
                if (sb) {
                  try {
                    const currentMeta = (sb as any)?.metadata || {};
                    // Remove any sharedOwners if incorrectly set, keep only ownerFullAgentKey
                    const desiredMeta: any = { ownerFullAgentKey: baseKey };
                    // Explicitly clear sharedOwners for sleeptime-only blocks
                    if (currentMeta.sharedOwners || currentMeta.ownerFullAgentKey !== baseKey) {
                      try {
                        await (client.blocks as any).update(sb.id, { metadata: desiredMeta });
                        console.log('Ensured sleeptime-only block has no sharedOwners:', targetLabel);
                        try { sb = await client.blocks.retrieve(sb.id) as any; } catch (_e) {}
                      } catch (metaErr) {
                        console.warn('Failed to update sleeptime-only block metadata:', formatError(metaErr));
                      }
                    }
                  } catch (_e) {
                    // ignore
                  }

                  // If we have a block (created or found), attach it to the sleeptime agent ONLY
                  const sbId = (sb as any)?.id;
                  if (!sbId) {
                    console.warn('Sleeptime block missing id, skipping attach:', targetLabel);
                    continue;
                  }

                  try {
                    await client.agents.blocks.attach(sbId, { agent_id: sleeptimeAgentId });
                    console.log('Attached sleeptime-only block', targetLabel, '->', sleeptimeAgentId);
                  } catch (attachErr) {
                    // 409 / duplicate attach is benign
                    const detail = (attachErr as any)?.detail || (attachErr as any)?.message || '';
                    if (/(unique|duplicate|409)/i.test(String(detail))) {
                      console.log('Block already attached to sleeptime agent, skipping attach:', targetLabel);
                    } else {
                      console.warn('Failed to attach sleeptime block', targetLabel, formatError(attachErr));
                    }
                  }
                }
              }

              // Ensure SLEEPTIME memory editing tools are attached to the sleeptime agent
              // Per Letta docs: sleeptime agent has memory management tools to edit primary agent's blocks
              // These tools allow the sleeptime agent to consolidate and synthesize memory during user downtime
              const sleeptimeTools = [
                // Memory editing tools (the core purpose of sleeptime agents)
                'memory',
                'memory_insert', 
                'memory_replace',
                'memory_rethink',      // Key sleep-time compute tool per research paper
                'memory_finish_edits', // Signal completion of memory editing
                // Archival memory for synthesis
                'archival_memory_search',
                'archival_memory_insert',
                // Conversation search for context during synthesis
                'conversation_search',
              ];
              for (const toolName of sleeptimeTools) {
                try {
                  const toolsResp = await client.tools.list({ name: toolName });
                  const tools = normalizeList<Tool>(toolsResp as unknown);
                  const tool = tools[0] ?? null;
                  if (tool) {
                    try {
                      await client.agents.tools.attach(tool.id, { agent_id: sleeptimeAgentId });
                      console.log(`Attached ${toolName} to sleeptime agent`);
                    } catch (err) {
                      console.warn('Failed to attach tool to sleeptime agent:', formatError(err));
                    }
                  } else {
                    console.warn('Tool not found in platform (skipping attach):', toolName);
                  }
                } catch (err) {
                  console.warn('Error while attaching tool to sleeptime agent', toolName, formatError(err));
                }
              }
            } else {
              console.log('No sleeptime agent found for', agentId);
            }
          }
        } catch (err) {
          console.warn('Error during sleeptime post-provision steps:', formatError(err));
        }
      }

      results.push({ key: cfg.key, agentId, status: 'ok' });
    } catch (err) {
      console.error('Provisioning failed for', cfg.key, err);
      results.push({ key: cfg.key, status: 'error', message: formatError(err) });
    }
  }

  return results;
}

// ============================================================================
// MASTER ORCHESTRATION: Provision Everything (Letta + Matrix)
// ============================================================================

export interface FullProvisionResult {
  success: boolean;
  letta: {
    agents: ProvisionResult[];
    successCount: number;
    errorCount: number;
  };
  matrix: MatrixProvisionResult | null;
  errors: string[];
}

/**
 * Provision the complete FlowKraft AI Hub environment.
 * 
 * This is the master orchestration function that:
 * 1. Provisions all Letta agents (Athena, Hephaestus, Hermes, Apollo)
 * 2. Provisions Matrix/Synapse (admin user, oracle rooms, kraftbot handlers)
 * 
 * After this completes, users can:
 * - Login to Element (http://localhost:8441) with admin/admin
 * - Chat with any oracle in their dedicated rooms (#athena, #hephaestus, #hermes, #apollo)
 * 
 * @param options - Configuration options
 * @returns Full provisioning result
 */
export async function provisionAll(options?: {
  /** Force re-provisioning: deletes existing Letta agents AND Matrix rooms before creating new ones */
  force?: boolean;
  /** Attach db_query tool to Athena only (detach when false) */
  giveDbQueryToolToAthena?: boolean;
  /** Skip Matrix provisioning */
  skipMatrix?: boolean;
  /** Matrix admin credentials */
  matrixAdmin?: { username: string; password: string };
  /** Matrix homeserver URL (for non-Docker environments) */
  matrixHomeserverUrl?: string;
  /** Matrix server name (default: localhost) */
  matrixServerName?: string;
  /** Matrix registration shared secret */
  matrixRegistrationSecret?: string;
}): Promise<FullProvisionResult> {
  const result: FullProvisionResult = {
    success: false,
    letta: {
      agents: [],
      successCount: 0,
      errorCount: 0,
    },
    matrix: null,
    errors: [],
  };

  console.log('\n' + '█'.repeat(70));
  console.log('█  FLOWKRAFT AI HUB - FULL PROVISIONING');
  console.log('█  Letta Agents + Matrix Chat Rooms');
  console.log('█'.repeat(70) + '\n');

  // =========================================================================
  // PHASE 1: Letta Agent Provisioning
  // =========================================================================
  console.log('\n' + '─'.repeat(70));
  console.log('│  PHASE 1: Letta Agent Provisioning');
  console.log('─'.repeat(70));

  try {
    const lettaResults = await provisionAllAgents({ force: options?.force, giveDbQueryToolToAthena: options?.giveDbQueryToolToAthena });
    result.letta.agents = lettaResults;
    result.letta.successCount = lettaResults.filter(r => r.status === 'ok').length;
    result.letta.errorCount = lettaResults.filter(r => r.status === 'error').length;

    console.log(`\n✅ Letta provisioning complete: ${result.letta.successCount} agents OK, ${result.letta.errorCount} errors`);
    
    if (result.letta.errorCount > 0) {
      for (const r of lettaResults.filter(r => r.status === 'error')) {
        result.errors.push(`Letta agent ${r.key}: ${r.message}`);
      }
    }
  } catch (err) {
    const errMsg = `Letta provisioning failed: ${formatError(err)}`;
    result.errors.push(errMsg);
    console.error(`\n❌ ${errMsg}`);
  }

  // =========================================================================
  // PHASE 2: Matrix Provisioning
  // =========================================================================
  if (options?.skipMatrix) {
    console.log('\n⏭️ Skipping Matrix provisioning (skipMatrix=true)');
  } else {
    console.log('\n' + '─'.repeat(70));
    console.log('│  PHASE 2: Matrix Room Provisioning');
    console.log('─'.repeat(70));

    // Configure Matrix from options or environment
    initMatrixConfig({
      homeserverUrl: options?.matrixHomeserverUrl || process.env.MATRIX_HOMESERVER_URL || 'http://flowkraft-ai-hub-matrix-synapse:8008',
      serverName: options?.matrixServerName || process.env.MATRIX_SERVER_NAME || 'localhost',
      registrationSharedSecret: options?.matrixRegistrationSecret || process.env.MATRIX_REGISTRATION_SECRET,
    });

    try {
      result.matrix = await provisionMatrixRooms({
        adminUsername: options?.matrixAdmin?.username || 'admin',
        adminPassword: options?.matrixAdmin?.password || 'admin',
        force: options?.force,
      });

      if (!result.matrix.success && !result.matrix.skipped) {
        result.errors.push(...result.matrix.errors);
      }
    } catch (err) {
      const errMsg = `Matrix provisioning failed: ${formatError(err)}`;
      result.errors.push(errMsg);
      console.error(`\n❌ ${errMsg}`);
    }
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  const matrixOk = options?.skipMatrix || result.matrix?.success === true || result.matrix?.skipped === true;
  result.success = result.errors.length === 0 && 
                   result.letta.errorCount === 0 && 
                   matrixOk;

  console.log('\n' + '█'.repeat(70));
  console.log('█  PROVISIONING COMPLETE');
  console.log('█'.repeat(70));
  console.log(`\n📊 Summary:`);
  console.log(`   • Letta Agents: ${result.letta.successCount}/${AGENTS.length} provisioned`);
  if (result.matrix) {
    if (result.matrix.skipped) {
      console.log(`   • Matrix Rooms: Already provisioned (skipped)`);
    } else {
      const fullyOp = result.matrix.rooms.filter(r => r.roomId && r.botJoined && r.handlerSet).length;
      console.log(`   • Matrix Rooms: ${fullyOp}/${result.matrix.rooms.length} fully operational (bot joined + handler set)`);
    }
    console.log(`   • Admin Login:  ${result.matrix.adminUser.username} / ${result.matrix.adminUser.password}`);
  }
  if (result.errors.length > 0) {
    console.log(`\n⚠️ Errors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`   - ${e}`));
  }
  console.log(`\n🚀 Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  if (result.success && result.matrix) {
    console.log('\n🌐 Next steps:');
    console.log('   1. Open Element: http://localhost:8441');
    console.log(`   2. Login with: ${result.matrix.adminUser.username} / ${result.matrix.adminUser.password}`);
    console.log('   3. Join rooms: #athena, #hephaestus, #hermes, #pythia, #apollo');
    console.log('   4. Start chatting with your AI oracles!');
  }

  console.log('\n█  CHAT2DB (JupyterLab)');
  console.log('█  Athena endpoint: http://flowkraft-ai-hub-frend:3000/api/openai/athena/v1/chat/completions');
  console.log('█  Status: Pre-configured (resolves agent key "athena" automatically)');
  console.log('█  JupyterLab: http://localhost:8441/lab/tree/00-chat.ipynb');

  console.log('\n' + '█'.repeat(70) + '\n');

  return result;
}

// provisionAllAgents is already exported via `export async function`
// Default export is the full orchestration (Letta + Matrix)
export default provisionAll;
