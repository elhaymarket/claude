/* ==========================================================
   Soho Investment Group: landing page + questionnaire
   ========================================================== */

/* ---------- Settings ----------
   HubSpot: fill in portalId and formGuid and every completed
   questionnaire is sent straight to that HubSpot form, creating
   or updating a contact. Both IDs are shown in the form's
   embed code in HubSpot (see README.md for the steps).

   The two custom properties must exist in HubSpot and be added
   to the form (they can be hidden fields). Set either name to ""
   to stop sending it.

   formEndpoint: optional extra address that receives a JSON copy
   of each lead (e.g. Formspree or another webhook).

   With nothing filled in, the thank-you screen still shows but
   the details only go to the browser console. */
const CONFIG = {
  hubspot: {
    portalId: "",
    formGuid: "",
    avenueProperty: "investment_avenue",
    answersProperty: "questionnaire_answers",
  },
  formEndpoint: "",
};

/* ---------- Investment avenues ---------- */
const AVENUES = {
  pre: {
    title: "Pre-Production Investment",
    text: "You're drawn to the very beginning of a project: development, scripts, casting and planning. Pre-production is where films and series are shaped before a camera turns, and we'll send you information on current opportunities at this stage.",
  },
  production: {
    title: "Production Investment",
    text: "You want to be close to the action. Production covers studios, crews and shoots, where the story is captured on set and on location. We'll send you information on current production opportunities.",
  },
  post: {
    title: "Post-Production Investment",
    text: "You're interested in the craft that turns raw footage into a finished film or series: editing, colour grading, sound and visual effects. We'll send you information on current post-production opportunities.",
  },
  av: {
    title: "Audio Visual Investment",
    text: "Technology and innovation appeal to you. Audio visual centres on home cinemas and the latest screening equipment: premium projection, screens and sound systems that bring the big-screen experience into homes and private venues. We'll send you information on current audio visual opportunities.",
  },
  hmu: {
    title: "Hair and Make-Up Investment",
    text: "You appreciate the specialist talent behind the look of a production: hair, make-up and prosthetics for film and TV. We'll send you information on current hair and make-up opportunities.",
  },
  festival: {
    title: "Film Festival Investment",
    text: "Premieres, screenings and the festival circuit are where films meet audiences, buyers and distributors. We'll send you information on current film festival opportunities.",
  },
};

/* ---------- Questions ----------
   Each answer adds points to one or more avenues.
   The avenue with the most points after five questions is the match. */
const QUESTIONS = [
  {
    q: "Which part of making a film or TV show interests you most?",
    options: [
      { label: "Shaping the idea: scripts, casting and planning", points: { pre: 2 } },
      { label: "Being on set when the cameras roll", points: { production: 2 } },
      { label: "The edit suite: cutting, colour and effects", points: { post: 2 } },
      { label: "The tech: home cinemas and the latest screening equipment", points: { av: 2 } },
      { label: "The look: hair, make-up and prosthetics", points: { hmu: 2 } },
      { label: "Premieres, red carpets and the festival circuit", points: { festival: 2 } },
    ],
  },
  {
    q: "What kind of projects would you most like to be connected to?",
    options: [
      { label: "Independent films heading for festivals", points: { festival: 1, pre: 1 } },
      { label: "High-end drama and streaming series", points: { production: 1, post: 1 } },
      { label: "Period dramas and fantasy with striking looks", points: { hmu: 1, production: 1 } },
      { label: "Immersive viewing: premium sound and big-screen experiences", points: { av: 1, festival: 1 } },
    ],
  },
  {
    q: "At what point would you prefer to get involved?",
    options: [
      { label: "Right at the start, before anything is filmed", points: { pre: 2 } },
      { label: "During filming", points: { production: 1, hmu: 1 } },
      { label: "After filming, as the project is finished", points: { post: 2 } },
      { label: "When it's released and shown to audiences", points: { festival: 2 } },
    ],
  },
  {
    q: "Which of these sounds most appealing to you?",
    options: [
      { label: "Supporting skilled crews and creative talent", points: { hmu: 1, production: 1 } },
      { label: "Backing home cinema and the latest screening technology", points: { av: 2 } },
      { label: "Seeing raw footage become a finished piece", points: { post: 2 } },
      { label: "Being part of industry events and screenings", points: { festival: 2 } },
    ],
  },
  {
    q: "How would you describe your interest in the screen industry?",
    options: [
      { label: "I love the storytelling and the creative process", points: { pre: 1, production: 1 } },
      { label: "I'm fascinated by the craft behind the scenes", points: { hmu: 1, post: 1 } },
      { label: "I'm drawn to innovation and new technology", points: { av: 2 } },
      { label: "I enjoy the glamour and the big occasions", points: { festival: 1, hmu: 1 } },
    ],
  },
];

/* ---------- Elements ---------- */
const quiz = document.getElementById("quiz");
const bar = quiz.querySelector(".quiz__bar");
const steps = {
  question: quiz.querySelector('[data-step="question"]'),
  result: quiz.querySelector('[data-step="result"]'),
  thanks: quiz.querySelector('[data-step="thanks"]'),
};
const countEl = quiz.querySelector(".quiz__count");
const questionEl = quiz.querySelector(".quiz__question");
const optionsEl = quiz.querySelector(".quiz__options");
const backBtn = steps.question.querySelector(".quiz__back");
const form = document.getElementById("lead-form");
const formError = form.querySelector(".form__error");

let current = 0;
let answers = [];
let match = null;
let lastFocus = null;

/* ---------- Open / close ---------- */
function openQuiz() {
  lastFocus = document.activeElement;
  quiz.hidden = false;
  document.body.classList.add("no-scroll");
  if (match === null) resetQuiz();
  quiz.querySelector(".quiz__close").focus();
}

function closeQuiz() {
  quiz.hidden = true;
  document.body.classList.remove("no-scroll");
  if (history.replaceState && location.hash === "#quiz") {
    history.replaceState(null, "", location.pathname + location.search);
  }
  if (lastFocus) lastFocus.focus();
}

document.querySelectorAll("[data-open-quiz]").forEach((el) =>
  el.addEventListener("click", openQuiz)
);
quiz.querySelectorAll("[data-close-quiz]").forEach((el) =>
  el.addEventListener("click", closeQuiz)
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !quiz.hidden) closeQuiz();
});

/* ---------- Steps ---------- */
function showStep(name) {
  Object.entries(steps).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

function resetQuiz() {
  current = 0;
  answers = [];
  match = null;
  form.reset();
  formError.hidden = true;
  showStep("question");
  renderQuestion();
}

function renderQuestion() {
  const item = QUESTIONS[current];
  countEl.textContent = `Question ${current + 1} of ${QUESTIONS.length}`;
  questionEl.textContent = item.q;
  bar.style.width = `${(current / QUESTIONS.length) * 100}%`;
  backBtn.hidden = current === 0;

  optionsEl.innerHTML = "";
  item.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz__option";
    btn.setAttribute("role", "listitem");
    if (answers[current] === i) btn.classList.add("is-selected");
    btn.innerHTML = `<span class="quiz__letter">${String.fromCharCode(65 + i)}</span><span></span>`;
    btn.lastChild.textContent = opt.label;
    btn.addEventListener("click", () => choose(i, btn));
    optionsEl.appendChild(btn);
  });

  // Restart the entrance animation for each new question
  steps.question.style.animation = "none";
  void steps.question.offsetWidth;
  steps.question.style.animation = "";
}

function choose(index, btn) {
  answers[current] = index;
  optionsEl.querySelectorAll(".quiz__option").forEach((b) => b.classList.remove("is-selected"));
  btn.classList.add("is-selected");

  setTimeout(() => {
    if (current < QUESTIONS.length - 1) {
      current += 1;
      renderQuestion();
    } else {
      showResult();
    }
  }, 260);
}

backBtn.addEventListener("click", () => {
  if (current > 0) {
    current -= 1;
    renderQuestion();
  }
});

quiz.querySelector(".quiz__restart").addEventListener("click", resetQuiz);

/* ---------- Scoring ---------- */
function score() {
  const totals = Object.fromEntries(Object.keys(AVENUES).map((k) => [k, 0]));
  answers.forEach((optIndex, qIndex) => {
    const pts = QUESTIONS[qIndex].options[optIndex].points;
    Object.entries(pts).forEach(([k, v]) => (totals[k] += v));
  });

  const best = Math.max(...Object.values(totals));
  const tied = Object.keys(totals).filter((k) => totals[k] === best);
  if (tied.length === 1) return tied[0];

  // Tie-break: use the most recent answer that points to one of the tied avenues,
  // starting with question 1 (the most direct question).
  for (const qIndex of [0, 4, 3, 2, 1]) {
    const pts = QUESTIONS[qIndex].options[answers[qIndex]].points;
    const hit = tied.find((k) => k in pts);
    if (hit) return hit;
  }
  return tied[0];
}

function showResult() {
  match = score();
  const avenue = AVENUES[match];
  bar.style.width = "100%";
  steps.result.querySelector(".quiz__result-title").textContent = avenue.title;
  steps.result.querySelector(".quiz__result-text").textContent = avenue.text;
  showStep("result");
  quiz.querySelector(".quiz__panel").scrollTop = 0;
}

/* ---------- Form ---------- */
function validate() {
  let ok = true;
  form.querySelectorAll("input[required]").forEach((input) => {
    const valid = input.type === "checkbox" ? input.checked : input.checkValidity() && input.value.trim() !== "";
    input.classList.toggle("is-invalid", !valid);
    if (!valid) ok = false;
  });
  return ok;
}

form.addEventListener("input", (e) => e.target.classList.remove("is-invalid"));

// Sends a lead to HubSpot's Forms API (no login or API key needed)
async function sendToHubSpot(payload) {
  const hs = CONFIG.hubspot;
  const field = (name, value) => ({ objectTypeId: "0-1", name, value });
  const fields = [
    field("firstname", payload.firstName),
    field("lastname", payload.lastName),
    field("email", payload.email),
    field("phone", payload.phone),
  ];
  if (hs.avenueProperty) fields.push(field(hs.avenueProperty, payload.investmentAvenue));
  if (hs.answersProperty) {
    const lines = payload.answers.map((a, i) => `Q${i + 1}. ${a.question}\nA: ${a.answer}`);
    const utm = ["utm_source", "utm_medium", "utm_campaign"]
      .filter((k) => payload[k])
      .map((k) => `${k}: ${payload[k]}`);
    if (utm.length) lines.push(utm.join("\n"));
    fields.push(field(hs.answersProperty, lines.join("\n\n")));
  }

  // Links the lead to their website visits if the HubSpot tracking code is on the page
  const hutk = (document.cookie.match(/(?:^|;\s*)hubspotutk=([^;]+)/) || [])[1];
  const context = { pageUri: location.href, pageName: document.title };
  if (hutk) context.hutk = hutk;

  const res = await fetch(
    `https://api.hsforms.com/submissions/v3/integration/submit/${encodeURIComponent(hs.portalId)}/${encodeURIComponent(hs.formGuid)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields, context }),
    }
  );
  if (!res.ok) {
    console.error("HubSpot rejected the submission:", res.status, await res.text().catch(() => ""));
    throw new Error(`HubSpot status ${res.status}`);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;

  if (!validate()) {
    formError.textContent = "Please fill in every field and tick the box to continue.";
    formError.hidden = false;
    return;
  }

  const data = Object.fromEntries(new FormData(form).entries());
  const params = new URLSearchParams(location.search);
  const payload = {
    firstName: data.firstName.trim(),
    lastName: data.lastName.trim(),
    email: data.email.trim(),
    phone: data.phone.trim(),
    consent: true,
    investmentAvenue: AVENUES[match].title,
    answers: answers.map((a, i) => ({
      question: QUESTIONS[i].q,
      answer: QUESTIONS[i].options[a].label,
    })),
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    submittedAt: new Date().toISOString(),
  };

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  try {
    const hs = CONFIG.hubspot;
    if (hs.portalId && hs.formGuid) await sendToHubSpot(payload);
    if (CONFIG.formEndpoint) {
      const res = await fetch(CONFIG.formEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
    }
    if (!(hs.portalId && hs.formGuid) && !CONFIG.formEndpoint) {
      console.info("No HubSpot form or formEndpoint set. Submission:", payload);
    }
    steps.thanks.querySelector(".quiz__thanks-text").textContent =
      `Thanks, ${payload.firstName}. We'll send information on ${AVENUES[match].title} to ${payload.email} shortly.`;
    showStep("thanks");
  } catch (err) {
    formError.textContent = "Sorry, something went wrong. Please try again in a moment.";
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send me the information";
  }
});

/* ---------- Page details ---------- */
document.getElementById("year").textContent = new Date().getFullYear();

// Nav background once the page scrolls
const nav = document.querySelector(".nav");
const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 20);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Fade sections in as they enter the screen
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      }),
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el, i) => {
    el.style.transitionDelay = `${(i % 3) * 80}ms`;
    io.observe(el);
  });
} else {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
}

// Talent carousel: arrows, plus a gentle auto-advance that pauses on hover or touch
const track = document.querySelector(".talent__track");
if (track) {
  const step = () => {
    const card = track.querySelector(".talent__card");
    return card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0) : 300;
  };
  const atEnd = () => track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  const next = () => (atEnd() ? track.scrollTo({ left: 0 }) : track.scrollBy({ left: step() }));
  const prev = () => (track.scrollLeft <= 4 ? track.scrollTo({ left: track.scrollWidth }) : track.scrollBy({ left: -step() }));

  let paused = false;
  let lastClick = 0;
  document.querySelector("[data-talent-next]").addEventListener("click", () => { lastClick = Date.now(); next(); });
  document.querySelector("[data-talent-prev]").addEventListener("click", () => { lastClick = Date.now(); prev(); });

  ["mouseenter", "touchstart", "focusin"].forEach((ev) => track.addEventListener(ev, () => (paused = true), { passive: true }));
  ["mouseleave", "focusout"].forEach((ev) => track.addEventListener(ev, () => (paused = false)));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    setInterval(() => {
      if (!paused && quiz.hidden && !document.hidden && Date.now() - lastClick > 6000) next();
    }, 4000);
  }
}

// Open the questionnaire straight away from links ending in #quiz or ?quiz
if (location.hash === "#quiz" || new URLSearchParams(location.search).has("quiz")) {
  openQuiz();
}
