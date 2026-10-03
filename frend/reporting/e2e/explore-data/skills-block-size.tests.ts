// The `skills` memory block of every AI Hub agent, rendered by the real skillsBlock().
//
// Letta rejects a memory block larger than its limit (Constants.MAX_BLOCK_SIZE, 20 KB),
// and the provisioner does not say so loudly, so a skill added to an agent can push the
// block over the edge and the agent silently keeps its old block. This spec renders every
// agent's block and fails first, with a margin below the limit.
//
// The second group holds Athena's dashboard-patterns skill to its wiring: listed in her
// block and only hers, described, with its SKILL.md and the references that file names on
// disk, and pointed at from her charter.

import * as fs from "fs";
import * as path from "path";

import { AGENTS } from "@/src/agents/agents-registry";
import { Constants } from "@/src/utils/constants";
import type { AgentConfig, MemoryBlockDef } from "@/src/agents/common";

const SKILLS_DIR = path.resolve(
  __dirname,
  "../../../../asbl/src/main/external-resources/db-template/_apps/flowkraft/_ai-hub/.skills",
);

// The block may not pass this. It leaves room for the descriptions to grow a little and
// for the limit's own counting (characters here, what Letta stores there) to differ.
const MAX_SKILLS_BLOCK_CHARS = 19500;
const MAX_DESCRIPTION_CHARS = 220;
const PATTERNS = "datapallas-dashboard-patterns";

// An agent's own skills block. getDefaultMemoryBlocks() puts an empty placeholder with the
// same label first; the block skillsBlock() renders is the one with a value.
function skillsOf(agent: AgentConfig): string {
  const blocks = (agent.memoryBlocks ?? []).filter(
    (b: MemoryBlockDef) => b.label === "skills" && (b.value ?? "").length > 0,
  );
  expect(blocks.length)
    .withContext(`${agent.key} has exactly one filled skills block`)
    .toBe(1);
  return blocks[0]?.value ?? "";
}

function athena(): AgentConfig {
  const found = AGENTS.find((a) => a.key === "athena");
  expect(found).withContext("the registry holds Athena").toBeDefined();
  return found as AgentConfig;
}

describe("SKILLS BLOCK — every agent's block fits what Letta stores", () => {
  it("keeps a margin below Letta's block limit", () => {
    expect(MAX_SKILLS_BLOCK_CHARS).toBeLessThan(Constants.MAX_BLOCK_SIZE);
  });

  for (const agent of AGENTS) {
    it(`${agent.key}: the rendered skills block is under ${MAX_SKILLS_BLOCK_CHARS} characters`, () => {
      const value = skillsOf(agent);
      expect(value.length).withContext(`${agent.key} skills block`).toBeGreaterThan(0);
      expect(value.length)
        .withContext(
          `${agent.key}: ${value.length} characters; shorten the longest descriptions in ` +
            `sharedMemory.ts (same meaning, fewer words) rather than raising the limit`,
        )
        .toBeLessThan(MAX_SKILLS_BLOCK_CHARS);
    });

    it(`${agent.key}: every skill in the block has a description`, () => {
      expect(skillsOf(agent)).not.toContain("Skill description not available");
    });
  }
});

describe("SKILLS BLOCK — Athena's dashboard-patterns skill is wired end to end", () => {
  it("is in Athena's block once, right after datapallas-dashboards, with its SKILL.md as the location", () => {
    const value = skillsOf(athena());
    expect(value.split(`<name>${PATTERNS}</name>`).length - 1)
      .withContext("the skill is listed once")
      .toBe(1);
    expect(value).toContain(
      `<location>/datapallas/_apps/flowkraft/_ai-hub/.skills/${PATTERNS}/SKILL.md</location>`,
    );
    const names = [...value.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]);
    expect(names.indexOf(PATTERNS))
      .withContext("right after datapallas-dashboards")
      .toBe(names.indexOf("datapallas-dashboards") + 1);
  });

  it("has a real description of at most 220 characters", () => {
    const value = skillsOf(athena());
    const m = value.match(
      new RegExp(`<name>${PATTERNS}</name>\\s*<description>([\\s\\S]*?)</description>`),
    );
    expect(m).withContext("the skill has a description tag").not.toBeNull();
    const description = m?.[1] ?? "";
    expect(description.length).toBeGreaterThan(40);
    expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
    expect(description).toContain("dashboards");
  });

  it("has a SKILL.md on disk that names every reference it keeps, and each one exists", () => {
    const skillMd = path.join(SKILLS_DIR, PATTERNS, "SKILL.md");
    expect(fs.existsSync(skillMd)).withContext(skillMd).toBeTrue();
    const text = fs.readFileSync(skillMd, "utf8");
    const named = [...text.matchAll(/`((?:[a-z0-9-]+)\.md)`/g)].map((m) => m[1]);
    const expected = [
      "column-roles.md",
      "data-kinds.md",
      "layout-and-widgets.md",
      "sql-shapes.md",
      "live-demos.md",
      "worked-example-northwind.md",
    ];
    for (const file of expected) {
      expect(named).withContext(`SKILL.md names ${file}`).toContain(file);
      const onDisk = path.join(SKILLS_DIR, PATTERNS, "references", file);
      expect(fs.existsSync(onDisk)).withContext(onDisk).toBeTrue();
      expect(fs.statSync(onDisk).size).withContext(`${file} is not empty`).toBeGreaterThan(500);
    }
  });

  it("is Athena's alone", () => {
    for (const agent of AGENTS.filter((a) => a.key !== "athena")) {
      expect(skillsOf(agent))
        .withContext(`${agent.key} does not list ${PATTERNS}`)
        .not.toContain(`<name>${PATTERNS}</name>`);
    }
  });

  it("is pointed at from Athena's charter", () => {
    const charter = (athena().memoryBlocks ?? []).find((b) => b.label === "role_charter");
    expect(charter).withContext("Athena has a role charter").toBeDefined();
    expect(charter?.value ?? "").toContain(PATTERNS);
  });
});
