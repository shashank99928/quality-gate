#!/usr/bin/env node
/**
 * shsxnk Quality Gate — audit deployed pages for SEO, accessibility
 * markers, and security headers. Self-contained: no browser, no deps.
 *
 * CLI: node dist/index.mjs --base-url https://example.com [--pages /a,/b]
 * GitHub Action: inputs are read from INPUT_* environment variables.
 */
import { appendFileSync } from "node:fs";
import { auditPage, auditSecurityHeaders, collectPagesFromSitemap } from "./audit.mjs";

const CRITICAL = "critical";
const WARNING = "warning";

function readInputs() {
    const env = process.env;
    const input = (name, fallback) => {
        const envKey = `INPUT_${name.toUpperCase()}`;
        if (env[envKey] !== undefined) return env[envKey];
        return fallback;
    };

    const argv = process.argv.slice(2);
    let flagBaseUrl;
    let flagPages;
    let flagMaxPages;
    let flagFailOnFindings;
    let flagRequireCsp;
    let flagUserAgent;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        switch (arg) {
            case "--base-url":
                flagBaseUrl = next;
                i++;
                break;
            case "--pages":
                flagPages = next;
                i++;
                break;
            case "--max-pages":
                flagMaxPages = next;
                i++;
                break;
            case "--fail-on-findings":
                flagFailOnFindings = next;
                i++;
                break;
            case "--require-csp":
                flagRequireCsp = next;
                i++;
                break;
            case "--user-agent":
                flagUserAgent = next;
                i++;
                break;
            default:
                break;
        }
    }

    return {
        baseUrl: (flagBaseUrl ?? input("base-url", "")).replace(/\/+$/, ""),
        pages: flagPages ?? input("pages", "auto"),
        maxPages: Number(flagMaxPages ?? input("max-pages", 25)),
        failOnFindings: String(flagFailOnFindings ?? input("fail-on-findings", "true")) === "true",
        requireCsp: String(flagRequireCsp ?? input("require-csp", "false")) === "true",
        userAgent: flagUserAgent ?? input("user-agent", "shsxnk-quality-gate/1.0 (+https://github.com/shashank99928/quality-gate)"),
    };
}

async function buildTargets(baseUrl, pagesSetting, maxPages, userAgent) {
    if (pagesSetting && pagesSetting !== "auto") {
        return pagesSetting
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
            .slice(0, maxPages)
            .map((p) => (p.startsWith("http") ? p : `${baseUrl}${p.startsWith("/") ? "" : "/"}${p}`));
    }

    const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`, { headers: { "User-Agent": userAgent } });
    if (sitemapResponse.ok) {
        const xml = await sitemapResponse.text();
        const pages = collectPagesFromSitemap(xml, maxPages);
        if (pages.length > 0) return pages;
    }
    console.warn(`::warning::sitemap.xml unavailable or empty at ${baseUrl}; auditing "${baseUrl}/" only`);
    return [`${baseUrl}/`];
}

function writeOutput(context, name, value) {
    if (!process.env.GITHUB_OUTPUT) return;
    try {
        appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    } catch {
        // Output file may not exist in non-GitHub runs; ignore.
    }
}

async function run() {
    const inputs = readInputs();
    if (!inputs.baseUrl) {
        console.error("quality-gate: --base-url is required");
        process.exit(2);
    }

    let targets;
    try {
        targets = await buildTargets(inputs.baseUrl, inputs.pages, inputs.maxPages, inputs.userAgent);
    } catch (error) {
        console.error(`::error::quality-gate could not discover pages: ${error}`);
        process.exit(2);
    }

    let critical = 0;
    let warnings = 0;
    let problems = 0;
    const summaryRows = [];

    for (const url of targets) {
        let findings;
        try {
            const response = await fetch(url, {
                headers: { "User-Agent": inputs.userAgent },
                redirect: "follow",
            });
            const html = await response.text();
            const headers = Object.fromEntries(
                [...response.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]),
            );
            findings = response.ok
                ? [...auditPage({ url, html, headers, requireCsp: inputs.requireCsp }), ...auditSecurityHeaders(headers, url)]
                : [{ severity: CRITICAL, rule: "http-status", detail: `${url} returned ${response.status}` }];
        } catch (error) {
            findings = [{ severity: CRITICAL, rule: "fetch-error", detail: `${url}: ${error}` }];
        }

        const criticalCount = findings.filter((finding) => finding.severity === CRITICAL).length;
        const warningCount = findings.filter((finding) => finding.severity === WARNING).length;
        critical += criticalCount;
        warnings += warningCount;
        problems += findings.length;
        summaryRows.push({ url, critical: criticalCount, warnings: warningCount });

        console.log(`::group::${url} — ${findings.length} findings (${criticalCount} critical, ${warningCount} warnings)`);
        for (const finding of findings) {
            const level = finding.severity === CRITICAL ? "error" : "warning";
            console.log(`::${level} title=${finding.rule}::${finding.detail}`);
        }
        console.log("::endgroup::");
    }

    writeOutput(1, "pages-checked", String(targets.length));
    writeOutput(1, "problems", String(problems));
    writeOutput(1, "critical", String(critical));

    console.log("\nquality-gate summary");
    console.table(summaryRows.map((row) => ({
        url: row.url,
        critical: row.critical,
        warnings: row.warnings,
    })));
    console.log(
        `quality-gate: ${targets.length} pages · ${problems} findings · ${critical} critical · ${warnings} warnings`,
    );

    if (inputs.failOnFindings && critical > 0) process.exit(1);
}

function baseUrlSafe(value) {
    return String(value ?? "").trim();
}

await run();
