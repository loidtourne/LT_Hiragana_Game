
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

// ========================================
// SUPABASE CONFIGURATION
// ========================================

const supabaseClient = window.supabaseClient;
const OWNER_EMAIL = "loidtourne@gmail.com";

let currentUser = null;
let dailyCorrectCount = 0;
let dailyTotalQuestions = 0;

// Queue saves so consecutive answers aren't dropped.
let saveQueue = Promise.resolve();

// ========================================
// ELEMENTS
// ========================================

const characterElement = document.getElementById("hiragana");
const feedbackElement = document.getElementById("feedback");
const answerButtons = [...document.querySelectorAll(".answer")];

const nextButton = document.getElementById("nextButton");
const attemptsElement = document.getElementById("attempts");

const accuracyElement = document.getElementById("accuracy");
const resetButton = document.getElementById("resetButton");

const authButton = document.getElementById("authButton");
const accountStatus = document.getElementById("accountStatus");

const loginPanel = document.getElementById("loginPanel");
const loginForm = document.getElementById("loginPanel");
const loginEmail = document.getElementById("loginEmail");
const loginSubmit = document.getElementById("loginSubmit");
const loginMessage = document.getElementById("loginMessage");

// ========================================
// GAME STATE
// ========================================

let currentQuestion = null;
let previousCharacter = null;

let wrongAttempts = 0;
let correctCount = 0;
let questionCount = 0;

let questionFinished = false;

// ========================================
// DATE
// ========================================

function getLocalStudyDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ========================================
// RANDOMIZATION
// ========================================

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

// ========================================
// ACCURACY
// ========================================

function updateStats() {
  const accuracy = questionCount
    ? Math.round((correctCount / questionCount) * 100)
    : 0;

  accuracyElement.textContent = `${accuracy}%`;
}

// ========================================
// AUTHENTICATION UI
// ========================================

function updateAuthUI() {
  const isOwner = Boolean(
    currentUser &&
    currentUser.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );

  if (isOwner) {
    authButton.textContent = "Sign out";
    accountStatus.textContent = "Signed in as owner";
    loginPanel.hidden = true;
  } else {
    authButton.textContent = "Sign in";
    accountStatus.textContent = "Study mode";
  }
}

// ========================================
// SIGN IN / SIGN OUT
// ========================================

authButton.addEventListener("click", async () => {
  if (currentUser) {
    authButton.disabled = true;

    const { error } = await supabaseClient.auth.signOut();

    authButton.disabled = false;

    if (error) {
      console.error("Sign-out error:", error);
      accountStatus.textContent = "Could not sign out";
      return;
    }

    currentUser = null;
    dailyCorrectCount = 0;
    dailyTotalQuestions = 0;

    updateAuthUI();
    return;
  }

  loginPanel.hidden = !loginPanel.hidden;

  if (!loginPanel.hidden) {
    loginEmail.focus();
  }
});

// Send magic link
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!supabaseClient) {
    loginMessage.textContent = "Supabase is not connected.";
    return;
  }

  const email = loginEmail.value.trim().toLowerCase();

  if (email !== OWNER_EMAIL.toLowerCase()) {
    loginMessage.textContent = "This email is not authorized.";
    return;
  }

  loginSubmit.disabled = true;
  loginSubmit.textContent = "Sending...";
  loginMessage.textContent = "";

  try {
    const redirectUrl = `${window.location.origin}${window.location.pathname}`;

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectUrl
      }
    });

    if (error) throw error;

    loginMessage.textContent =
      "Sign-in link sent! Check your email.";

  } catch (error) {
    console.error("Sign-in error:", error);
    loginMessage.textContent =
      error.message || "Unable to send sign-in link.";
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Send sign-in link";
  }
});

// ========================================
// AUTH SESSION
// ========================================

async function initializeAuth() {
  if (!supabaseClient) {
    console.warn("Supabase client was not found.");
    accountStatus.textContent = "Supabase unavailable";
    return;
  }

  try {
    const {
      data: { session },
      error
    } = await supabaseClient.auth.getSession();

    if (error) throw error;

    currentUser = session?.user || null;

    if (
      currentUser &&
      currentUser.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()
    ) {
      await supabaseClient.auth.signOut();
      currentUser = null;
    }

    updateAuthUI();

    if (currentUser) {
      await loadDailyHistory();
    }

  } catch (error) {
    console.error("Authentication initialization error:", error);
    accountStatus.textContent = "Authentication unavailable";
  }

  // Keep the UI updated if the session changes in another app
  // or after returning from the magic-link email.
  supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;

    if (
      currentUser &&
      currentUser.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()
    ) {
      currentUser = null;
      supabaseClient.auth.signOut();
    }

    updateAuthUI();

    if (event === "SIGNED_IN" && currentUser) {
      loadDailyHistory();
    }

    if (event === "SIGNED_OUT") {
      dailyCorrectCount = 0;
      dailyTotalQuestions = 0;
    }
  });
}

// ========================================
// STREAK CALCULATIONS
// ========================================

function getDateOffset(dateString, offset) {
  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day + offset));

  return date.toISOString().slice(0, 10);
}

function updateCombos(history) {
  const historyByDate = new Map(
    history.map(row => [row.study_date, row])
  );

  const today = getLocalStudyDate();
  const todayRecord = historyByDate.get(today);

  // If today's 10 questions are complete, today's result
  // determines whether the current streak continues.
  // Otherwise, use yesterday as the starting point.
  let currentDate;

  if (todayRecord && todayRecord.total_questions >= 10) {
    currentDate = todayRecord.qualifies ? today : null;
  } else {
    currentDate = getDateOffset(today, -1);
  }

  // Calculate current combo.
  let currentCombo = 0;

  while (currentDate) {
    const record = historyByDate.get(currentDate);

    if (!record || !record.qualifies) break;

    currentCombo++;
    currentDate = getDateOffset(currentDate, -1);
  }

  // Calculate best combo across all recorded days.
  const sortedDates = [...historyByDate.keys()].sort();

  let bestCombo = 0;
  let runningCombo = 0;
  let previousDate = null;

  sortedDates.forEach(date => {
    const record = historyByDate.get(date);

    if (!record.qualifies) {
      runningCombo = 0;
      previousDate = date;
      return;
    }

    if (
      previousDate &&
      date !== getDateOffset(previousDate, 1)
    ) {
      runningCombo = 0;
    }

    runningCombo++;
    bestCombo = Math.max(bestCombo, runningCombo);

    previousDate = date;
  });

  // Update the HTML.
  document.getElementById("currentCombo").textContent =
    `🔥 ${currentCombo}`;

  document.getElementById("bestCombo").textContent =
    `🔥 ${bestCombo}`;
}

// ========================================
// DAILY LIMIT UI
// ========================================

function showDailyLimit() {
  answerButtons.forEach(button => {
    button.disabled = true;
  });

  document.querySelector(".answers").classList.add("daily-limit");

  feedbackElement.textContent =
    "Daily limit reached. Come back tomorrow!";

  feedbackElement.className = "feedback";

  attemptsElement.textContent =
    "You've completed 10 questions today.";

  nextButton.hidden = true;
}

// ========================================
// LOAD DAILY HISTORY AND STREAKS
// ========================================

async function loadDailyHistory() {
  if (!supabaseClient || !currentUser) return;

  try {
    const { data, error } = await supabaseClient
      .from("hiragana_daily_history")
      .select("study_date, correct_count, total_questions, qualifies")
      .eq("user_id", currentUser.id)
      .order("study_date", { ascending: true });

    if (error) throw error;

    const history = data || [];

    // Load today's totals for the quiz.
    const today = getLocalStudyDate();

    const todayRecord = history.find(
      row => row.study_date === today
    );

    dailyCorrectCount = todayRecord?.correct_count ?? 0;
    dailyTotalQuestions = todayRecord?.total_questions ?? 0;

    // Calculate current and best combos.
    updateCombos(history);

    // Apply the daily limit after loading Supabase history.
    if (dailyTotalQuestions >= 10) {
      showDailyLimit();
    } else {
      startQuestion();
    }

    console.log("Daily history and streaks loaded:", {
      dailyCorrectCount,
      dailyTotalQuestions,
      history
    });

  } catch (error) {
    console.error("Error loading daily history:", error);
  }
}

// ========================================
// SAVE DAILY RESULT
// ========================================

function saveDailyResult() {
  if (!supabaseClient || !currentUser) {
    console.log("Not signed in. Daily history was not saved.");
    return;
  }

  // Each save runs after the previous save finishes.
  saveQueue = saveQueue
    .then(async () => {
      if (!currentUser) return;

      const qualifies =
        dailyTotalQuestions >= 10 &&
        (dailyCorrectCount / dailyTotalQuestions) >= 0.70;

      const dailyResult = {
        user_id: currentUser.id,
        study_date: getLocalStudyDate(),
        correct_count: dailyCorrectCount,
        total_questions: dailyTotalQuestions,
        qualifies
      };

      const { error } = await supabaseClient
        .from("hiragana_daily_history")
        .upsert(dailyResult, {
          onConflict: "user_id,study_date"
        });

      if (error) throw error;

      console.log("Daily result saved:", dailyResult);
      await loadDailyHistory();
    })
    .catch(error => {
      console.error("Error saving daily result:", error);
    });

  return saveQueue;
}

// ========================================
// COMPLETE QUESTION
// ========================================

function completeQuestion(wasCorrect) {
  questionFinished = true;

  questionCount++;
  dailyTotalQuestions++;

  if (wasCorrect) {
    correctCount++;
    dailyCorrectCount++;
  }

  updateStats();
  saveDailyResult();

  // Stop the quiz immediately after question 10.
  if (dailyTotalQuestions >= 10) {
    showDailyLimit();
  }
}

// ========================================
// START QUESTION
// ========================================

function startQuestion() {
  // Stop quiz when daily limit is reached.
  if (dailyTotalQuestions >= 10) {
    showDailyLimit();
    return;
  }

  document.querySelector(".answers").classList.remove("daily-limit");

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

  const uniqueRomaji = [...new Set(
    hiragana.map(([, romaji]) => romaji)
  )];

  const wrongOptions = shuffle(
    uniqueRomaji.filter(
      romaji => romaji !== currentQuestion[1]
    )
  ).slice(0, 3);

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

// ========================================
// SELECT ANSWER
// ========================================

function chooseAnswer(event) {
  const button = event.currentTarget;

  if (
    questionFinished ||
    button.disabled ||
    dailyTotalQuestions >= 10
  ) return;

  const selected = button.dataset.answer;

  if (selected === currentQuestion[1]) {
    completeQuestion(true);

    // Preserve the daily-limit message after question 10.
    if (dailyTotalQuestions >= 10) return;

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
    completeQuestion(false);

    // Preserve the daily-limit message after question 10.
    if (dailyTotalQuestions >= 10) return;

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

// ========================================
// EVENT LISTENERS
// ========================================

answerButtons.forEach(button => {
  button.addEventListener("click", chooseAnswer);
});

nextButton.addEventListener("click", startQuestion);

// ========================================
// RESET SESSION SCORE
// ========================================

resetButton.addEventListener("click", () => {
  correctCount = 0;
  questionCount = 0;

  updateStats();

  // Resetting session accuracy does not reset the daily limit.
  startQuestion();
});

// ========================================
// INITIALIZE
// ========================================

async function initializeQuiz() {
  updateStats();

  // Wait for Supabase history before starting the quiz.
  await initializeAuth();

  // Start a question if history did not already start one.
  if (dailyTotalQuestions < 10 && !currentQuestion) {
    startQuestion();
  }
}

initializeQuiz();
