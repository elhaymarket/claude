/* ==========================================================
   Datamine Promotions: lead capture function (Netlify)

   Receives a completed questionnaire from the landing page and
   records it in HubSpot WITHOUT changing existing contacts:

   - New email address      -> submits the HubSpot form (falls back to
                               creating the contact directly)
   - Existing email address -> leaves the contact's details exactly as
                               they are and adds a note with the enquiry

   Needs one environment variable in Netlify:
     HUBSPOT_TOKEN  = the access token of a HubSpot private app with the
                      scopes crm.objects.contacts.read,
                      crm.objects.contacts.write and forms
   ========================================================== */

const HUBSPOT_API = "https://api.hubapi.com";

// HubSpot form that NEW leads are submitted to, so they appear under the
// form's Submissions and count towards its marketing campaign.
// Set HUBSPOT_FORM_GUID to "" in Netlify to switch this off.
const FORM = {
  portalId: process.env.HUBSPOT_PORTAL_ID || "27183426",
  formGuid: process.env.HUBSPOT_FORM_GUID !== undefined ? process.env.HUBSPOT_FORM_GUID : "a86a48d0-3665-47de-8d4b-2a36f11f43e8",
  hosts: ["api-eu1.hsforms.com", "api.hsforms.com"],
};

// Contact properties set on NEW contacts only
const PROPERTIES = {
  avenue: "investment_avenue",
  answers: "questionnaire_answers",
  leadSource: "lead_source",
};
const LEAD_SOURCE_VALUE = "Datamine Marketing Site";

// HubSpot's built-in association type: note -> contact
const NOTE_TO_CONTACT = 202;

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const clean = (value, max = 500) => String(value == null ? "" : value).trim().slice(0, max);

// Read the HubSpot token, ignoring stray spaces or quotes from copy and paste
function getToken() {
  // Accept the expected name, or a near miss (different capitals or a stray space in the name)
  const key =
    ["HUBSPOT_TOKEN", "HUBSPOT_ACCESS_TOKEN", "HUBSPOT_PRIVATE_APP_TOKEN"].find((k) => process.env[k]) ||
    Object.keys(process.env).find((k) => /^hubspot[_ ]?(access[_ ]?|private[_ ]?app[_ ]?)?token$/i.test(k.trim()) && process.env[k]);
  const raw = key ? process.env[key] : "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

async function hubspot(path, method, body) {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

// Which HubSpot account the token belongs to (helps confirm leads go to the right place)
let cachedPortalId;
async function getPortalId() {
  if (cachedPortalId !== undefined) return cachedPortalId;
  try {
    const res = await hubspot("/account-info/v3/details", "GET");
    cachedPortalId = res.ok && res.data.portalId ? res.data.portalId : null;
  } catch (_) {
    cachedPortalId = null;
  }
  return cachedPortalId;
}

async function findContactId(email) {
  const res = await hubspot("/crm/v3/objects/contacts/search", "POST", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
    properties: ["email"],
    limit: 1,
  });
  if (!res.ok) throw new Error(`Search failed (${res.status}): ${JSON.stringify(res.data)}`);
  return res.data.results && res.data.results[0] ? res.data.results[0].id : null;
}

async function createContact(properties) {
  let res = await hubspot("/crm/v3/objects/contacts", "POST", { properties });

  // A custom property not set up in HubSpot yet: create the contact without
  // the custom properties so the lead is never lost (the full enquiry still
  // goes into a note).
  if (!res.ok && res.status === 400) {
    const core = {};
    ["email", "firstname", "lastname", "phone"].forEach((k) => {
      if (properties[k]) core[k] = properties[k];
    });
    console.warn("Contact create rejected, retrying with core fields only:", JSON.stringify(res.data));
    res = await hubspot("/crm/v3/objects/contacts", "POST", { properties: core });
  }
  return res;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Submit a NEW lead to the HubSpot form (authenticated, so reCAPTCHA isn't needed)
async function submitForm(properties, context) {
  if (!FORM.formGuid) return { ok: false, skipped: true };
  const send = async (props) => {
    const body = {
      fields: Object.entries(props).filter(([, v]) => v).map(([name, value]) => ({ objectTypeId: "0-1", name, value: String(value) })),
      context,
    };
    for (const host of FORM.hosts) {
      try {
        const res = await fetch(`https://${host}/submissions/v3/integration/secure/submit/${FORM.portalId}/${FORM.formGuid}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return { ok: res.ok, status: res.status, text: await res.text() };
      } catch (err) {
        console.warn(`Could not reach ${host}:`, err.message);
      }
    }
    return { ok: false, status: 0, text: "unreachable" };
  };

  let res = await send(properties);
  let leadSourceSent = true;
  // Lead source not added to the form yet: submit without it (it is set on the contact afterwards)
  if (!res.ok && res.status === 400 && /lead_source/.test(res.text)) {
    const { [PROPERTIES.leadSource]: _omit, ...rest } = properties;
    res = await send(rest);
    leadSourceSent = false;
  }
  if (!res.ok) console.warn("Form submission not accepted:", res.status, res.text);
  return { ...res, leadSourceSent };
}

// After a form submission, wait briefly for HubSpot to create the contact
async function waitForContact(email, tries = 5, gapMs = 1200) {
  for (let i = 0; i < tries; i++) {
    await sleep(gapMs);
    const id = await findContactId(email);
    if (id) return id;
  }
  return null;
}

async function addNote(contactId, html) {
  const res = await hubspot("/crm/v3/objects/notes", "POST", {
    properties: { hs_timestamp: new Date().toISOString(), hs_note_body: html },
    associations: [
      {
        to: { id: contactId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTE_TO_CONTACT }],
      },
    ],
  });
  if (!res.ok) throw new Error(`Note failed (${res.status}): ${JSON.stringify(res.data)}`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!getToken()) {
    // Help diagnose set-up problems without revealing any values: list the
    // names of HubSpot-related variables this function can see
    const seen = Object.keys(process.env).filter((k) => /hub|spot/i.test(k));
    console.error("HUBSPOT_TOKEN is not available to this function. Related variable names seen:", seen);
    return json(500, { error: "Not configured", variablesSeen: seen, context: process.env.CONTEXT || null });
  }
  if ((event.body || "").length > 20000) return json(413, { error: "Too large" });

  let p;
  try { p = JSON.parse(event.body || "{}"); } catch (_) { return json(400, { error: "Invalid JSON" }); }

  const lead = {
    firstName: clean(p.firstName, 100),
    lastName: clean(p.lastName, 100),
    email: clean(p.email, 254).toLowerCase(),
    phone: clean(p.phone, 40),
    investmentAvenue: clean(p.investmentAvenue, 500),
    suggestedAvenue: clean(p.suggestedAvenue, 200),
    consent: p.consent === true,
    consentText: clean(p.consentText, 1000),
    pageUri: clean(p.pageUri, 500),
    pageName: clean(p.pageName, 200),
    hutk: clean(p.hutk, 100),
    utm: ["utm_source", "utm_medium", "utm_campaign"].map((k) => [k, clean(p[k], 200)]).filter(([, v]) => v),
    answers: Array.isArray(p.answers) ? p.answers.slice(0, 10).map((a) => ({ q: clean(a.question, 300), a: clean(a.answer, 300) })) : [],
  };

  if (!lead.firstName || !lead.lastName || !lead.phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return json(400, { error: "Missing or invalid details" });
  }
  if (!lead.consent) return json(400, { error: "Consent required" });

  // Plain-text summary for the questionnaire_answers property
  const summary = [
    `Interest area from questionnaire: ${lead.suggestedAvenue}\nWants information on: ${lead.investmentAvenue}`,
    ...lead.answers.map((x, i) => `Q${i + 1}. ${x.q}\nA: ${x.a}`),
  ];
  if (lead.utm.length) summary.push(lead.utm.map(([k, v]) => `${k}: ${v}`).join("\n"));
  summary.push(`Consent given: ${new Date().toISOString()}\n${lead.consentText}`);

  // Note body (HTML) used for existing contacts, and as a record on new ones
  const noteHtml =
    `<p><strong>Datamine Marketing Site enquiry</strong></p>` +
    `<p>Wants information on: ${escapeHtml(lead.investmentAvenue)}<br>Interest area from questionnaire: ${escapeHtml(lead.suggestedAvenue)}</p>` +
    `<p>Name given: ${escapeHtml(lead.firstName)} ${escapeHtml(lead.lastName)}<br>Phone given: ${escapeHtml(lead.phone)}</p>` +
    (lead.answers.length ? `<p>${lead.answers.map((x, i) => `Q${i + 1}. ${escapeHtml(x.q)}<br>A: ${escapeHtml(x.a)}`).join("<br><br>")}</p>` : "") +
    (lead.utm.length ? `<p>${lead.utm.map(([k, v]) => `${k}: ${escapeHtml(v)}`).join("<br>")}</p>` : "") +
    `<p>Consent given ${new Date().toISOString()}: ${escapeHtml(lead.consentText)}</p>` +
    (lead.pageUri ? `<p>Page: ${escapeHtml(lead.pageUri)}</p>` : "");

  try {
    let contactId = await findContactId(lead.email);

    if (contactId) {
      // Existing contact: do not change any of their details, just log the enquiry
      await addNote(contactId, noteHtml);
      const portalId = await getPortalId();
      console.log(`Lead saved: existing contact ${contactId} (note added), HubSpot account ${portalId}`);
      return json(200, { ok: true, contact: "existing", contactId, portalId });
    }

    const properties = {
      email: lead.email,
      firstname: lead.firstName,
      lastname: lead.lastName,
      phone: lead.phone,
      [PROPERTIES.avenue]: lead.investmentAvenue,
      [PROPERTIES.answers]: summary.join("\n\n"),
      [PROPERTIES.leadSource]: LEAD_SOURCE_VALUE,
    };

    // New email: submit the HubSpot form so the lead shows under Submissions
    // and the campaign, then confirm HubSpot actually created the contact.
    let via = "crm";
    const ip = (event.headers && (event.headers["x-nf-client-connection-ip"] || (event.headers["x-forwarded-for"] || "").split(",")[0].trim())) || "";
    const context = { pageUri: lead.pageUri || undefined, pageName: lead.pageName || undefined, hutk: lead.hutk || undefined, ipAddress: ip || undefined };
    const form = await submitForm(properties, context);
    if (form.ok) {
      contactId = await waitForContact(lead.email);
      if (contactId) {
        via = "form";
        if (!form.leadSourceSent) {
          // The contact was created moments ago by this submission, so it is safe to set its lead source
          await hubspot(`/crm/v3/objects/contacts/${contactId}`, "PATCH", { properties: { [PROPERTIES.leadSource]: LEAD_SOURCE_VALUE } })
            .catch(() => {});
        }
      } else {
        console.warn("Form accepted but no contact appeared (possibly filtered as spam). Creating it directly.");
      }
    }

    if (!contactId) {
      const created = await createContact(properties);
      if (created.ok) {
        contactId = created.data.id;
      } else if (created.status === 409) {
        // The form submission (or another request) created it in the meantime
        const m = JSON.stringify(created.data).match(/Existing ID: ?(\d+)/);
        contactId = m ? m[1] : await findContactId(lead.email);
        if (!contactId) throw new Error(`Conflict without ID: ${JSON.stringify(created.data)}`);
        via = form.ok ? "form" : "crm";
      } else {
        throw new Error(`Create failed (${created.status}): ${JSON.stringify(created.data)}`);
      }
    }

    // Record the full enquiry and consent on the new contact too
    await addNote(contactId, noteHtml).catch((err) => console.warn("Note on new contact failed:", err.message));
    const portalId = await getPortalId();
    console.log(`Lead saved: new contact ${contactId} via ${via}, HubSpot account ${portalId}`);
    return json(200, { ok: true, contact: "new", via, contactId, portalId });
  } catch (err) {
    console.error("Lead capture failed:", err.message);
    // Include HubSpot's status code (e.g. 401 bad token, 403 missing scope) to help diagnose
    const m = String(err.message).match(/\((\d{3})\)/);
    return json(502, { error: "Could not save lead", hubspotStatus: m ? Number(m[1]) : null, step: String(err.message).split(" ")[0] });
  }
};
