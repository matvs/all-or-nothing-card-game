import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every `file:` dependency (the sibling `core` repo packages) is installed by npm as a
 * SYMLINK pointing outside the app directory. A symlink whose target was never copied
 * into the image is silently accepted at build time — `npm install` succeeds, the
 * frontend bundle builds, the image is tagged — and the server then dies at startup with
 * ERR_MODULE_NOT_FOUND on its very first import.
 *
 * That is exactly how `@matvs/core-node` (added with real-credential login) shipped an
 * image that crash-looped 127 times: the Dockerfile vendored `core-realtime` only.
 * Nothing failed until runtime, so nothing caught it.
 *
 * These tests read the two files against each other, so adding a `file:` dependency
 * without teaching the Dockerfile to vendor it fails here instead of in production.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** WORKDIR of both the builder and the runtime stage — `file:` paths resolve against it. */
const IMAGE_WORKDIR = "/app";

interface FileDependency {
  readonly name: string;
  /** Absolute path the installed symlink resolves to inside the image. */
  readonly targetInImage: string;
}

function fileDependencies(): FileDependency[] {
  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };

  return Object.entries(manifest.dependencies ?? {})
    .filter(([, spec]) => spec.startsWith("file:"))
    .map(([name, spec]) => ({
      name,
      targetInImage: path.posix.resolve(IMAGE_WORKDIR, spec.slice("file:".length)),
    }));
}

/** Split the Dockerfile into its stages, keyed by the `AS <name>` alias. */
function dockerfileStages(): { name: string; body: string }[] {
  const dockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
  const stages: { name: string; body: string }[] = [];

  for (const line of dockerfile.split("\n")) {
    const from = /^FROM\s+\S+(?:\s+AS\s+(\S+))?/i.exec(line);
    if (from) {
      stages.push({ name: from[1] ?? `stage-${stages.length}`, body: "" });
      continue;
    }
    if (stages.length > 0) stages[stages.length - 1].body += `${line}\n`;
  }
  return stages;
}

/** Destinations of every COPY in a stage (the last token of the instruction). */
function copyDestinations(stageBody: string): string[] {
  return stageBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^COPY\s/i.test(line))
    .map((line) => line.split(/\s+/).filter((token) => !token.startsWith("--")).pop() ?? "")
    .filter(Boolean);
}

function vendors(stageBody: string, targetInImage: string): boolean {
  return copyDestinations(stageBody).some(
    (destination) =>
      destination === targetInImage || destination.startsWith(`${targetInImage}/`),
  );
}

describe("Dockerfile vendors every file: dependency", () => {
  const dependencies = fileDependencies();

  it("the app actually has file: dependencies (guards against a vacuous suite)", () => {
    expect(dependencies.length).toBeGreaterThan(0);
  });

  describe.each(dependencies)("$name", ({ targetInImage }) => {
    it(`is built or copied into ${targetInImage} by some stage`, () => {
      const stages = dockerfileStages();
      const vendoring = stages.filter((stage) => vendors(stage.body, targetInImage));

      expect(
        vendoring.map((stage) => stage.name),
        `No stage copies anything into ${targetInImage}, so npm's symlink dangles`,
      ).not.toHaveLength(0);
    });

    it(`is present in the runtime stage at ${targetInImage}`, () => {
      const stages = dockerfileStages();
      const runtime = stages[stages.length - 1];

      expect(
        vendors(runtime.body, targetInImage),
        `Runtime stage "${runtime.name}" copies node_modules (with the symlink) but not ` +
          `${targetInImage} itself — the server dies with ERR_MODULE_NOT_FOUND at startup`,
      ).toBe(true);
    });
  });
});
