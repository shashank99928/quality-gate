#!/usr/bin/env node
/**
 * Page-audit engine for shsxnk Quality Gate.
 * Self-contained HTTP checks — no browser, no external services.
 */

const CRITICAL = "critical";
const WARNING = "warning";

const SECURITY_HEADERS = {
    "strict-transport-security": "HSTS",
    "x-content-type-options": "nosniff",
    "referrer-policy": "Referrer-Policy",
    "permissions-policy": "Permissions-Policy",
};

export function collectPagesFromSitemap(sitemapXml, maxPages) {
    const urls = [...sitemapXml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) =>
        m[1].trim(),
    );
    return urls.slice(0, Math.max(1, Number(maxPages) || 25));
}

export function auditPage({ url, html, headers, requireCsp }) {
    const findings = [];
    const add = (severity, rule, detail) => findings.push({ severity, rule, detail });

    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
    if (!title) add(CRITICAL, "title-missing", "No <title> element.");
    else if (title.length < 15 || title.length > 70)
        add(WARNING, "title-length", `Title length ${title.length}; expected 15–70 chars.`);

    const description = /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html)?.[1];
    if (!description || description.trim().length === 0)
        add(CRITICAL, "meta-description-missing", "No meta description.");
    else if (description.trim().length < 50)
        add(WARNING, "meta-description-short", "Meta description shorter than 50 chars.");

    const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
    if (h1Count === 0) add(CRITICAL, "h1-missing", "No <h1> in server HTML.");
    else if (h1Count > 1)
        add(CRITICAL, "h1-multiple", `${h1Count} <h1> elements; use exactly one.`);

    if (!/<link[^>]+rel=["']canonical["']/i.test(html))
        add(WARNING, "canonical-missing", "No canonical link element.");

    if (!/<meta\s+(?:property=["']og:title|name=["']og:title)/i.test(html))
        add(WARNING, "og-title-missing", "No og:title.");

    if (!/<textarea|<input|<select/i.test(html) === false && !/<label/i.test(html))
        add(WARNING, "form-labels", "Form fields present but no <label> element found.");

    if (!/<html[^>]+lang=/i.test(html)) add(CRITICAL, "html-lang", "<html> lacks a lang attribute.");

    if (/<img(?![^>]*alt=)[^>]*>/i.test(html)) {
        const count = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) ?? []).length;
        add(WARNING, "img-alt", `${count} <img> tags missing alt in server HTML.`);
    }

    if (!/application\/ld\+json/i.test(html))
        add(WARNING, "jsonld-missing", "No JSON-LD script found.");

    if (html.length > 250_000) add(WARNING, "html-size", `Server HTML is ${Math.round(html.length / 1024)} KB (> 250 KB).`);

    if (requireCsp && !headers["content-security-policy"])
        add(CRITICAL, "csp-missing", "No Content-Security-Policy header.");

    return findings;
}

export function auditSecurityHeaders(headers, url) {
    const findings = [];
    const add = (severity, rule, detail) => findings.push({ severity, rule, detail });

    if (!headers["strict-transport-security"])
        add(CRITICAL, "hsts-missing", `${url}: no Strict-Transport-Security header.`);
    if (!headers["x-content-type-options"])
        add(WARNING, "nosniff-missing", `${url}: no X-Content-Type-Options header.`);
    if (!headers["referrer-policy"])
        add(WARNING, "referrer-policy-missing", `${url}: no Referrer-Policy header.`);

    return findings;
}
