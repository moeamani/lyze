import type { Dataset } from "@/lib/analysis/dataset";
import type { Variable } from "@/lib/analysis/variables";

const rString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

/**
 * An R script that loads the exported CSV with proper types, factor labels and variable
 * labels. (data.sav in the same bundle can be read with haven for SPSS-style labelled vectors.)
 */
export function rScript(dataset: Dataset, opts: { title: string; generatedAt: Date; variables?: Variable[] }): string {
  const variables = opts.variables ?? dataset.variables;
  const lines: string[] = [];
  lines.push(`# ${opts.title}`);
  lines.push(`# Exported from Lyze on ${opts.generatedAt.toISOString().slice(0, 10)} — ${dataset.rows.length} responses, ${variables.length} variables.`);
  lines.push(`#`);
  lines.push(`# Usage: put this script next to data.csv, then`);
  lines.push(`#   source("lyze_import.R")`);
  lines.push(`# It creates a data frame called \`lyze\` with labelled factors and variable labels.`);
  lines.push(``);
  lines.push(`# Prefer SPSS-style labelled data? haven::read_sav("data.sav") reads the same data with value labels.`);
  lines.push(``);
  lines.push(`local({`);
  lines.push(`  lyze <- read.csv("data.csv", na.strings = "", stringsAsFactors = FALSE, check.names = FALSE, encoding = "UTF-8", fileEncoding = "UTF-8-BOM")`);
  lines.push(``);
  lines.push(`  # Categorical answers become factors with their labels.`);
  for (const v of variables) {
    if (v.type !== "numeric" || !v.categories?.length) continue;
    const levels = v.categories.map((c) => c.value).join(", ");
    const labels = v.categories.map((c) => rString(c.label)).join(", ");
    if (v.measure === "nominal" && !(v.categories.length === 2 && v.categories.some((c) => c.label === "Selected"))) {
      lines.push(`  lyze[[${rString(v.name)}]] <- factor(lyze[[${rString(v.name)}]], levels = c(${levels}), labels = c(${labels}))`);
    } else if (v.measure === "ordinal") {
      // Keep ordinal scales numeric for means/correlations; add an ordered factor alongside.
      lines.push(`  lyze[[${rString(`${v.name}_f`)}]] <- factor(lyze[[${rString(v.name)}]], levels = c(${levels}), labels = c(${labels}), ordered = TRUE)`);
    }
  }
  lines.push(``);
  lines.push(`  # Variable labels (shown by RStudio's View(), labelled::, gtsummary::…).`);
  for (const v of variables) lines.push(`  attr(lyze[[${rString(v.name)}]], "label") <- ${rString(v.label)}`);
  for (const v of variables.filter((x) => x.id === "meta:started" || x.id === "meta:submitted")) {
    lines.push(`  lyze[[${rString(v.name)}]] <- as.POSIXct(lyze[[${rString(v.name)}]], format = "%Y-%m-%dT%H:%M:%OSZ", tz = "UTC")`);
  }
  lines.push(`  lyze <<- lyze`);
  lines.push(`})`);
  lines.push(``);
  lines.push(`message("Loaded ", nrow(lyze), " responses into \`lyze\`.")`);
  lines.push(``);
  return lines.join("\n");
}
