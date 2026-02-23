import { ensureDir } from "@std/fs";
import { dirname, join, relative, toFileUrl } from "@std/path";
import { transpile } from "@deno/emit";

const DIST_DIR = "dist";
const SCRIPTS_DIR = "scripts";
const DATA_DIR = "data";

const denoConfig = JSON.parse(await Deno.readTextFile("deno.json")) as {
  imports?: Record<string, string>;
};
const importMap = denoConfig.imports
  ? { imports: denoConfig.imports }
  : undefined;

const replaceTsImports = (code: string): string =>
  code.replace(/((?:\.\.?\/)[^'"\n]+)\.ts/g, "$1.js");

const cleanDist = async () => {
  try {
    await Deno.remove(DIST_DIR, { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }
  await ensureDir(DIST_DIR);
};

const copyFile = async (src: string, dest: string) => {
  await ensureDir(dirname(dest));
  await Deno.copyFile(src, dest);
};

const copyDir = async (srcDir: string, destDir: string) => {
  await ensureDir(destDir);
  for await (const entry of Deno.readDir(srcDir)) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);
    if (entry.isDirectory) {
      await copyDir(src, dest);
    } else if (entry.isFile) {
      await copyFile(src, dest);
    }
  }
};

const buildIndex = async () => {
  const html = await Deno.readTextFile("index.html");
  const updated = html.replace(
    /src="scripts\/main\.ts"/g,
    'src="scripts/main.js"',
  );
  await Deno.writeTextFile(join(DIST_DIR, "index.html"), updated);
};

const transpileScripts = async () => {
  const outRoot = join(DIST_DIR, SCRIPTS_DIR);
  await ensureDir(outRoot);

  for await (const entry of Deno.readDir(SCRIPTS_DIR)) {
    await transpileEntry(join(SCRIPTS_DIR, entry.name));
  }

  async function transpileEntry(path: string) {
    const stat = await Deno.stat(path);
    if (stat.isDirectory) {
      for await (const entry of Deno.readDir(path)) {
        await transpileEntry(join(path, entry.name));
      }
      return;
    }

    if (!path.endsWith(".ts")) return;

    const absPath = join(Deno.cwd(), path);
    const url = toFileUrl(absPath);
    const emitted = await transpile(url, {
      allowRemote: true,
      importMap,
      compilerOptions: {
        sourceMap: true,
      },
    });

    const js = emitted.get(url.href);
    if (typeof js !== "string") {
      throw new Error(`Failed to transpile ${path}`);
    }

    const rel = relative(SCRIPTS_DIR, path).replace(/\.ts$/, ".js");
    const outPath = join(outRoot, rel);
    await ensureDir(dirname(outPath));
    await Deno.writeTextFile(outPath, replaceTsImports(js));
  }
};

if (import.meta.main) {
  await cleanDist();
  await buildIndex();
  await copyFile("styles.css", join(DIST_DIR, "styles.css"));
  await copyDir(DATA_DIR, join(DIST_DIR, DATA_DIR));
  await transpileScripts();

  console.log("Built static site into dist/");
}
