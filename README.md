# Soho Investment Group landing page

Plain HTML, CSS and JavaScript. No build step.

- `index.html`: page content and questionnaire markup
- `styles.css`: design (colours and fonts are set at the top under `:root`)
- `script.js`: questionnaire questions, scoring, result text and form submission

## Preview locally

Open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000.

## Linking straight to the questionnaire

Add `#quiz` (or `?quiz`) to the page URL, e.g. `https://yoursite.com/#quiz`, and the questionnaire opens as soon as the page loads. UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`) are passed through with each submission.

## Deploying (Netlify from GitHub)

Leads are saved by a small server function (`netlify/functions/lead.js`) so that existing HubSpot contacts are never changed:

- **New email address:** a new contact is created (with Investment avenue, Questionnaire answers and Lead source "Datamine Marketing Site") plus a note recording the enquiry and consent.
- **Existing email address:** the contact's details are left exactly as they are; a note with the enquiry is added to it.

Because of this function, the site must be deployed **from GitHub**, not by drag and drop:

1. In HubSpot, create a private app with the scopes `crm.objects.contacts.read` and `crm.objects.contacts.write`, and copy its access token.
2. In Netlify, choose *Add new site → Import an existing project → GitHub*, pick this repository and branch. Build settings are read from `netlify.toml`.
3. In Netlify, add an environment variable `HUBSPOT_TOKEN` with the token, then redeploy.

The direct-to-HubSpot form code in `script.js` is only used if `CONFIG.leadEndpoint` is emptied.

## Sending leads to HubSpot (direct form, not used by default)

Each completed questionnaire can create or update a contact in HubSpot through HubSpot's Forms API (no API key needed).

1. In HubSpot, create two contact properties (Settings > Properties > Contact properties):
   - `investment_avenue` (single-line text)
   - `questionnaire_answers` (multi-line text)
2. Create a form (Marketing > Forms) with First name, Last name, Email and Phone number, and add the two properties above as hidden fields.
3. Publish the form, open its embed code and copy the `portalId` and `formId` values.
4. Paste them into `CONFIG.hubspot` at the top of `script.js` (in the single-file version, the `<script>` section near the bottom): `portalId` and `formGuid`.

Every lead also sets a **Lead source** contact property (internal name `lead_source`) to "Datamine Marketing Site". Add that property to the form as a hidden field. If HubSpot rejects it, the lead is re-sent without it so it is never lost. Change `leadSourceProperty` / `leadSourceValue` in `CONFIG.hubspot` if your property or value differs.

Each lead arrives with their details, matched avenue, all five answers, and any `utm_source` / `utm_medium` / `utm_campaign` from the link. If you rename the properties, change `avenueProperty` and `answersProperty` to match, or set them to `""` to leave them out.

`formEndpoint` can also be set to send a JSON copy of each lead to another service. With neither set, submissions are only logged to the browser console.

## Editing the questions

Questions, answers and the points each answer gives to the six avenues are in the `QUESTIONS` list in `script.js`. Result wording is in `AVENUES`.
