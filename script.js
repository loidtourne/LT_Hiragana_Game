
const hiragana = [
  ["あ", "a"], ["い", "i"], ["う", "u"], ["え", "e"], ["お", "o"],
  ["か", "ka"], ["き", "ki"], ["く", "ku"], ["け", "ke"], ["こ", "ko"],
  ["さ", "sa"], ["し", "shi"], ["す", "su"], ["せ", "se"], ["そ", "so"],
  ["た", "ta"], ["ち", "chi"], ["つ", "tsu"], ["て", "te"], ["と", "to"],
  ["な", "na"], ["に", "ni"], ["ぬ", "nu"], ["ね", "ne"], ["の", "no"],
  ["は", "ha"], ["ひ", "hi"], ["ふ", "fu"], ["へ", "he"], ["ほ", "ho"],
  ["ま", "ma"], ["み", "mi"], ["む", "mu"], ["め", "me"], ["も", "mo"],
  ["や", "ya"], ["ゆ", "yu"], ["よ", "yo"],
  ["ら", "ra"], ["り", "ri"], ["る", "ru"], ["れ", "re"], ["ろ", "ro"],
  ["わ", "wa"], ["を", "wo"], ["ん", "n"],
  ["が", "ga"], ["ぎ", "gi"], ["ぐ", "gu"], ["げ", "ge"], ["ご", "go"],
  ["ざ", "za"], ["じ", "ji"], ["ず", "zu"], ["ぜ", "ze"], ["ぞ", "zo"],
  ["だ", "da"], ["ぢ", "ji"], ["づ", "zu"], ["で", "de"], ["ど", "do"],
  ["ば", "ba"], ["び", "bi"], ["ぶ", "bu"], ["べ", "be"], ["ぼ", "bo"],
  ["ぱ", "pa"], ["ぴ", "pi"], ["ぷ", "pu"], ["ぺ", "pe"], ["ぽ", "po"]
];

// SUPABASE

// Your index.html must initialize the Supabase client first
// and assign it to window.supabaseClient.

const supabaseClient = window.supabaseClient;

// Current authenticated user
let currentUser = null;

// Daily totals loaded from Supabase
let dailyCorrectCount = 0;
let dailyTotalQuestions = 0;

// Prevent overlapping saves
let saveInProgress = false;

// ELEMENTS

const characterElement = document.getElementById("hiragana");
const feedbackElement = document.getElementById("feedback");
const answerButtons = [...document.querySelectorAll(".answer")];

const nextButton = document.getElementById("nextButton");
const attemptsElement = document.getElementById("attempts");

const accuracyElement = document.getElementById("accuracy");
const resetButton = document.getElementById("resetButton");

// GAME STATE

let currentQuestion = null;
let previousCharacter = null;

let wrongAttempts = 0;
let correctCount = 0;
let questionCount = 0;

let questionFinished = false;

// DATE

function getLocalStudyDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// RANDOMIZATION

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// ACCURACY

function updateStats() {
  const accuracy = questionCount
    ? Math.round((correctCount / questionCount) * 100)
    : 0;

  accuracyElement.textContent = `${accuracy}%`;
}

// LOAD DAILY HISTORY

async function loadDailyHistory() {
  if (!supabaseClient) {
    console.warn("Supabase client was not found.");
    return;
  }

  try {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) throw userError;

    currentUser = user;

    if (!currentUser) {
      console.log("No authenticated user. Daily history will not be saved.");
      return;
    }

    const { data, error } = await supabaseClient
      .from("hiragana_daily_history")
      .select("correct_count, total_questions")
      .eq("user_id", currentUser.id)
      .eq("study_date", getLocalStudyDate())
      .maybeSingle();

    if (error) throw error;

    if (data) {
      dailyCorrectCount = data.correct_count;
      dailyTotalQuestions = data.total_questions;
    }

    console.log("Daily history loaded:", {
      dailyCorrectCount,
      dailyTotalQuestions
    });

  } catch (error) {
    console.error("Error loading daily history:", error);
  }
}

// SAVE DAILY RESULT

async function saveDailyResult() {
  if (!supabaseClient || !currentUser) {
    console.warn("Cannot save daily history: user is not signed in.");
    return;
  }

  if (saveInProgress) {
    console.warn("Daily history save already in progress.");
    return;
  }

  saveInProgress = true;

  // A day qualifies with at least 70% accuracy.
  const qualifies =
    dailyTotalQuestions > 0 &&
    (dailyCorrectCount / dailyTotalQuestions) >= 0.70;

  const dailyResult = {
    user_id: currentUser.id,
    study_date: getLocalStudyDate(),
    correct_count: dailyCorrectCount,
    total_questions: dailyTotalQuestions,
    qualifies: qualifies
  };

  try {
    const { error } = await supabaseClient
      .from("hiragana_daily_history")
      .upsert(dailyResult, {
        onConflict: "user_id,study_date"
      });

    if (error) throw error;

    console.log("Daily result saved:", dailyResult);

  } catch (error) {
    console.error("Error saving daily result:", error);

  } finally {
    saveInProgress = false;
  }
}

// COMPLETE QUESTION

function completeQuestion(wasCorrect) {
  questionFinished = true;

  questionCount++;
  dailyTotalQuestions++;

  if (wasCorrect) {
    correctCount++;
    dailyCorrectCount++;
  }

  updateStats();

  // Save the updated daily totals to Supabase.
  saveDailyResult();
}

// START QUESTION

function startQuestion() {
  const pool = hiragana.filter(
    ([character]) => character !== previousCharacter
  );

  currentQuestion = randomItem(pool);
  previousCharacter = currentQuestion[0];

  wrongAttempts = 0;
  questionFinished = false;

  characterElement.textContent = currentQuestion[0];

  feedbackElement.textContent = "Select the matching romaji.";
  feedbackElement.className = "feedback";

  attemptsElement.textContent = "You have 3 attempts.";

  nextButton.hidden = true;

  // Get unique romaji answers to avoid duplicate choices.
  const uniqueRomaji = [...new Set(
    hiragana.map(([, romaji]) => romaji)
  )];

  // Generate three incorrect choices.
  const wrongOptions = shuffle(
    uniqueRomaji.filter(
      romaji => romaji !== currentQuestion[1]
    )
  ).slice(0, 3);

  // Combine and shuffle all four choices.
  const options = shuffle([
    currentQuestion[1],
    ...wrongOptions
  ]);

  answerButtons.forEach((button, index) => {
    button.textContent = options[index];
    button.dataset.answer = options[index];

    button.disabled = false;
    button.className = "answer";
  });
}

// SELECT ANSWER

function chooseAnswer(event) {
  const button = event.currentTarget;

  if (questionFinished || button.disabled) return;

  const selected = button.dataset.answer;

  // CORRECT ANSWER

  if (selected === currentQuestion[1]) {
    completeQuestion(true);

    button.classList.add("right");

    answerButtons.forEach(item => {
      item.disabled = true;
    });

    feedbackElement.textContent = "Correct! Well done.";
    feedbackElement.className = "feedback success";

    attemptsElement.textContent = "Ready for the next character?";

    nextButton.hidden = false;

    return;
  }

  // INCORRECT ANSWER

  wrongAttempts++;

  button.classList.add("wrong");
  button.disabled = true;

  const remaining = 3 - wrongAttempts;

  if (remaining > 0) {
    feedbackElement.textContent = "Not quite. Try another answer.";
    feedbackElement.className = "feedback error";

    attemptsElement.textContent =
      `${remaining} ${remaining === 1 ? "attempt" : "attempts"} remaining.`;

  } else {
    // ALL THREE ATTEMPTS USED

    completeQuestion(false);

    answerButtons.forEach(item => {
      item.disabled = true;
    });

    feedbackElement.textContent =
      `The correct answer is ${currentQuestion[1]}.`;

    feedbackElement.className = "feedback error";

    attemptsElement.textContent = "No attempts remaining.";

    nextButton.hidden = false;
  }
}

// EVENT LISTENERS

answerButtons.forEach(button => {
  button.addEventListener("click", chooseAnswer);
});

nextButton.addEventListener("click", startQuestion);

// RESET SESSION SCORE

resetButton.addEventListener("click", () => {
  correctCount = 0;
  questionCount = 0;

  updateStats();

  // This resets the displayed session accuracy only.
  // It does NOT delete or reset Supabase daily history.

  startQuestion();
});

// INITIALIZE

async function initializeQuiz() {
  await loadDailyHistory();

  updateStats();
  startQuestion();
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.auth-button {
  background: var(--surface-raised);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.auth-button:hover {
  border-color: var(--accent);
}

.account-status {
  width: 100%;
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 11px;
  text-align: right;
}

initializeQuiz();
