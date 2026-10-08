# Soho Investment Group landing page

Plain HTML, CSS and JavaScript. No build step.

- `index.html`: page content and questionnaire markup
- `styles.css`: design (colours and fonts are set at the top under `:root`)
- `script.js`: questionnaire questions, scoring, result text and form submission

## Preview locally

Open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000.

## Linking straight to the questionnaire

Add `#quiz` (or `?quiz`) to the page URL, e.g. `https://yoursite.com/#quiz`, and the questionnaire opens as soon as the page loads. UTM parameters (`utm_source`, `utm_medium`, `utm_campaign`) are passed through with each submission.

## Receiving form submissions

Set `formEndpoint` at the top of `script.js` to a URL that accepts a JSON POST, such as a Formspree form or a CRM webhook. Each submission includes the person's details, their matched investment avenue, and their five answers. While `formEndpoint` is empty, submissions are only logged to the browser console.

## Editing the questions

Questions, answers and the points each answer gives to the six avenues are in the `QUESTIONS` list in `script.js`. Result wording is in `AVENUES`.
