/* ---------------------------------------------------------------------------
 * The site: register certificates so their QR code verifies (ADR 0100).
 * POST {site_url}/api/certificates/issue with the shared secret.
 * Only what is printed on the certificate is sent — never an email.
 * ------------------------------------------------------------------------- */

/**
 * Registers certificates in batches of 100. Throws on anything that isn't
 * per-row (no secret, wrong secret, site down, migration missing) so the run
 * stops before making PDFs whose QR code would lead nowhere.
 */
function registerOnSite_(settings, rows) {
  const secret = PropertiesService.getScriptProperties().getProperty("SITE_SECRET");
  if (!secret) {
    throw new Error("Not connected to the site: Certificates → Connect to the site (secret).");
  }
  const url = `${settings.site_url.replace(/\/$/, "")}/api/certificates/issue`;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map((r) => {
      const item = {
        id: r.certificate_id,
        edition: Number(settings.edition),
        fullName: r.full_name,
        role: r.role,
      };
      if (r.detail) item.detail = String(r.detail).slice(0, 200);
      return item;
    });
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: `Bearer ${secret}` },
      payload: JSON.stringify({ certificates: batch }),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code === 200) continue;
    let body = {};
    try {
      body = JSON.parse(res.getContentText());
    } catch (e) {
      body = {};
    }
    if (code === 401) throw new Error("The site refused the secret. Check Connect to the site and CERTIFICATES_SECRET on Vercel.");
    if (code === 503 && body.error === "not_configured") throw new Error("The site has no CERTIFICATES_SECRET set yet.");
    if (code === 503) throw new Error("The site can't store certificates yet (migration 0048 not applied).");
    if (code === 400) {
      const issue = (body.issues || [])[0];
      throw new Error(`The site rejected a certificate${issue ? ` (${issue.path}: ${issue.message})` : ""}. Check names, roles and detail length.`);
    }
    throw new Error(`The site answered ${code}. Try again later.`);
  }
}

/** The QR image for a certificate, from the site (a PNG of its verify URL). */
function qrBlob_(settings, id) {
  const url = `${settings.site_url.replace(/\/$/, "")}/api/certificates/${encodeURIComponent(id)}/qr`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error(`QR code: the site answered ${res.getResponseCode()}`);
  }
  return res.getBlob().setName(`${id}-qr.png`);
}
