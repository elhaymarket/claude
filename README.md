# Soho Investment Group landing page

Plain HTML, CSS and JavaScript. No build step.

- `index.html`: page content and questionnaire markup
- `styles.css`: design (colours and fonts are set at the top under `:root`)
- `script.js`: questionnaire questions, scoring, result text and form submission

## Preview locally

Open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000.

## Linking straight to the questionnaire

Add `#quiz` (or `?quiz`) to the page URL, e.g. `https://yoursite.com/#quiz`, and the questionnaire opens as soon as the page loads. UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`) are passed through with each submission.

## Sending leads to HubSpot

Each completed questionnaire can create or update a contact in HubSpot through HubSpot's Forms API (no API key needed).

1. In HubSpot, create two contact properties (Settings > Properties > Contact properties):
   - `investment_avenue` (single-line text)
   - `questionnaire_answers` (multi-line text)
2. Create a form (Marketing > Forms) with First name, Last name, Email and Phone number, and add the two properties above as hidden fields.
3. Publish the form, open its embed code and copy the `portalId` and `formId` values.
4. Paste them into `CONFIG.hubspot` at the top of `script.js` (in the single-file version, the `<script>` section near the bottom): `portalId` and `formGuid`.

Each lead arrives with their details, matched avenue, all five answers, and any `utm_source` / `utm_medium` / `utm_campaign` from the link. If you rename the properties, change `avenueProperty` and `answersProperty` to match, or set them to `""` to leave them out.

`formEndpoint` can also be set to send a JSON copy of each lead to another service. With neither set, submissions are only logged to the browser console.

## Editing the questions

Questions, answers and the points each answer gives to the six avenues are in the `QUESTIONS` list in `script.js`. Result wording is in `AVENUES`.
