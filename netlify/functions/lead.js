/* ==========================================================
   Datamine Promotions: lead capture function (Netlify)

   Receives a completed questionnaire from the landing page and
   records it in HubSpot WITHOUT changing existing contacts:

   - New email address      -> creates a new contact
   - Existing email address -> leaves the contact's details exactly as
                               they are and adds a note with the enquiry

   Needs one environment variable in Netlify:
     HUBSPOT_TOKEN  = the access token of a HubSpot private app with the
                      scopes crm.objects.contacts.read and
                      crm.objects.contacts.write
   ========================================================== */

const HUBSPOT_API = "https://api.hubapi.com";

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
      return json(200, { ok: true, contact: "existing" });
    }

    const created = await createContact({
      email: lead.email,
      firstname: lead.firstName,
      lastname: lead.lastName,
      phone: lead.phone,
      [PROPERTIES.avenue]: lead.investmentAvenue,
      [PROPERTIES.answers]: summary.join("\n\n"),
      [PROPERTIES.leadSource]: LEAD_SOURCE_VALUE,
    });

    if (created.ok) {
      contactId = created.data.id;
    } else if (created.status === 409) {
      // Created by someone else a moment ago: treat as existing
      const m = JSON.stringify(created.data).match(/Existing ID: ?(\d+)/);
      contactId = m ? m[1] : await findContactId(lead.email);
      if (!contactId) throw new Error(`Conflict without ID: ${JSON.stringify(created.data)}`);
      await addNote(contactId, noteHtml);
      return json(200, { ok: true, contact: "existing" });
    } else {
      throw new Error(`Create failed (${created.status}): ${JSON.stringify(created.data)}`);
    }

    // Record the full enquiry and consent on the new contact too
    await addNote(contactId, noteHtml).catch((err) => console.warn("Note on new contact failed:", err.message));
    return json(200, { ok: true, contact: "new" });
  } catch (err) {
    console.error("Lead capture failed:", err.message);
    // Include HubSpot's status code (e.g. 401 bad token, 403 missing scope) to help diagnose
    const m = String(err.message).match(/\((\d{3})\)/);
    return json(502, { error: "Could not save lead", hubspotStatus: m ? Number(m[1]) : null, step: String(err.message).split(" ")[0] });
  }
};
