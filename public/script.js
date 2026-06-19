/* ══════════════════════════════════════════
   YouTube Quiz Generator — Application Logic
   ══════════════════════════════════════════ */

// ── State ──
let questions = [];
let answers = {};
let quizData = null;
let currentVideoId = null;

// ── DOM References ──
const $ = (id) => document.getElementById(id);

// ── Paste Button ──
$('pasteBtn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    $('urlInput').value = text;
    $('urlInput').focus();
  } catch {
    // Clipboard access denied — ignore silently
  }
});

// ── Enter key triggers generate ──
$('urlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleGenerate();
});

// ── Extract YouTube Video ID ──
function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v') ||
        (u.pathname.includes('/embed/') ? u.pathname.split('/embed/')[1].split('?')[0] : null) ||
        (u.pathname.includes('/shorts/') ? u.pathname.split('/shorts/')[1].split('?')[0] : null);
    }
  } catch (e) {}
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Error Handling ──
function showError(msg) {
  const toast = $('errorToast');
  $('errorMsg').textContent = msg;
  toast.style.display = 'flex';
  setTimeout(() => { toast.style.display = 'none'; }, 8000);
}

function hideError() {
  $('errorToast').style.display = 'none';
}

// ── Escape HTML ──
function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ── Loading State Management ──
function showLoading() {
  $('heroSection').style.display = 'none';
  $('quizSection').style.display = 'none';
  $('loadingSection').style.display = 'flex';

  // Reset loading steps
  ['ls1', 'ls2', 'ls3'].forEach(id => {
    $(id).className = 'load-step';
  });
  $('ls1').classList.add('active');
  $('progressBar').style.width = '10%';

  // Animate through steps
  setTimeout(() => {
    $('ls1').className = 'load-step done';
    $('ls2').className = 'load-step active';
    $('progressBar').style.width = '40%';
    $('loadingTitle').textContent = 'AI Analyzing Topics...';
    $('loadingSubtitle').textContent = 'Groq AI is identifying key concepts from the transcript';
  }, 1500);

  setTimeout(() => {
    $('ls2').className = 'load-step done';
    $('ls3').className = 'load-step active';
    $('progressBar').style.width = '75%';
    $('loadingTitle').textContent = 'Generating Questions...';
    $('loadingSubtitle').textContent = 'Creating quiz questions based on the video content';
  }, 3000);
}

function hideLoading() {
  $('progressBar').style.width = '100%';
  ['ls1', 'ls2', 'ls3'].forEach(id => {
    $(id).className = 'load-step done';
  });
  setTimeout(() => {
    $('loadingSection').style.display = 'none';
  }, 400);
}

// ── Main Generate Function ──
async function handleGenerate() {
  const url = $('urlInput').value.trim();
  hideError();
  answers = {};
  questions = [];
  quizData = null;

  if (!url) {
    showError('Please paste a YouTube URL first.');
    return;
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    showError('Invalid YouTube URL. Please paste a valid link like https://youtube.com/watch?v=...');
    return;
  }

  currentVideoId = videoId;
  const qCount = $('qCount').value;
  const difficulty = $('difficulty').value;
  const model = $('modelSelect').value;

  $('generateBtn').disabled = true;
  showLoading();

  try {
    const response = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, qCount: parseInt(qCount), difficulty })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate quiz');
    }

    // Cache hit: Quiz is ready immediately
    if (data.cached) {
      if (!data.quiz || !data.quiz.questions || data.quiz.questions.length === 0) {
        throw new Error('No cached questions were found.');
      }
      quizData = data.quiz;
      questions = data.quiz.questions;
      hideLoading();
      renderQuiz(data.videoId);
      $('generateBtn').disabled = false;
    } else {
      // Cache miss: Start polling background job
      pollJob(data.jobId, 'quiz', data.videoId);
    }

  } catch (e) {
    hideLoading();
    $('heroSection').style.display = 'block';
    showError(e.message || 'Something went wrong. Please try again.');
    $('generateBtn').disabled = false;
  }
}

// ── Render Quiz ──
function renderQuiz(videoId) {
  $('quizSection').style.display = 'block';
  $('scoreSection').style.display = 'none';

  // Video bar
  $('videoThumb').src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  $('videoTitle').textContent = quizData.videoTitle || 'YouTube Video';
  $('videoTopic').textContent = `Topic: ${quizData.topic || 'General'}`;

  // Topics strip
  const topics = quizData.topicsCovered || [];
  $('topicsStrip').innerHTML = topics.map(t => `<span class="topic-chip">${escHtml(t)}</span>`).join('');

  // Progress
  updateProgress();

  // Questions
  const container = $('questionsContainer');
  container.innerHTML = '';

  questions.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.id = `qcard-${i}`;
    card.style.animationDelay = `${i * 0.08}s`;

    const letters = ['A', 'B', 'C', 'D'];

    card.innerHTML = `
      <div class="question-card__header">
        <span class="question-card__num">Question ${i + 1} of ${questions.length}</span>
      </div>
      <p class="question-card__text">${escHtml(q.question)}</p>
      <div class="options-grid" id="opts-${i}">
        ${(q.options || []).map((opt, j) => `
          <button class="option-btn" onclick="selectAnswer(${i}, ${j})" id="opt-${i}-${j}">
            <span class="option-btn__letter">${letters[j] || j + 1}</span>
            <span>${escHtml(opt.replace(/^[A-D]\)\s*/, ''))}</span>
          </button>
        `).join('')}
      </div>
      <div id="exp-${i}" class="explanation-box" style="display:none"></div>
    `;

    container.appendChild(card);
  });

  // Smooth scroll to quiz
  $('quizSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Select Answer ──
function selectAnswer(qIdx, optIdx) {
  if (answers[qIdx] !== undefined) return;
  answers[qIdx] = optIdx;

  const q = questions[qIdx];
  const card = $(`qcard-${qIdx}`);
  card.classList.add('answered');

  const btns = document.querySelectorAll(`#opts-${qIdx} .option-btn`);
  btns.forEach((btn, j) => {
    btn.disabled = true;
    if (j === q.correct && j === optIdx) {
      btn.classList.add('correct');
    } else if (j === optIdx) {
      btn.classList.add('wrong');
    } else if (j === q.correct) {
      btn.classList.add('reveal');
    }
  });

  // Show explanation
  const exp = $(`exp-${qIdx}`);
  if (q.explanation) {
    exp.innerHTML = `<strong>💡 Explanation:</strong> ${escHtml(q.explanation)}`;
    exp.style.display = 'block';
  }

  // Update progress
  updateProgress();

  // Check if all answered
  if (Object.keys(answers).length === questions.length) {
    setTimeout(showScore, 800);
  }
}

// ── Update Progress Bar ──
function updateProgress() {
  const answered = Object.keys(answers).length;
  const total = questions.length;
  const pct = total > 0 ? (answered / total) * 100 : 0;
  $('quizProgressFill').style.width = `${pct}%`;
  $('quizProgressText').textContent = `${answered} / ${total}`;
}

// ── Show Score ──
function showScore() {
  let correct = 0;
  questions.forEach((q, i) => {
    if (answers[i] === q.correct) correct++;
  });

  const pct = Math.round((correct / questions.length) * 100);
  const circumference = 2 * Math.PI * 52; // r=52

  // Determine message
  let emoji, msg;
  if (pct === 100) { emoji = '🎉'; msg = 'Perfect score! You nailed it!'; }
  else if (pct >= 80) { emoji = '🌟'; msg = 'Excellent work! Great understanding!'; }
  else if (pct >= 60) { emoji = '👍'; msg = 'Good job! Room for improvement.'; }
  else if (pct >= 40) { emoji = '📖'; msg = 'Keep studying, you\'re getting there!'; }
  else { emoji = '💪'; msg = 'Don\'t give up! Review the video and try again.'; }

  // Build score SVG with gradient
  const scoreSection = $('scoreSection');
  const scoreCard = scoreSection.querySelector('.score-card');

  // Add SVG gradient definition
  const svgEl = scoreCard.querySelector('.score-card__svg');
  if (!svgEl.querySelector('defs')) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.id = 'scoreGradient';
    grad.innerHTML = `
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="50%" stop-color="#ec4899"/>
      <stop offset="100%" stop-color="#22c55e"/>
    `;
    defs.appendChild(grad);
    svgEl.prepend(defs);
  }

  scoreSection.style.display = 'block';

  // Animate score ring
  const ring = $('scoreRing');
  ring.style.stroke = 'url(#scoreGradient)';
  setTimeout(() => {
    const offset = circumference - (pct / 100) * circumference;
    ring.style.strokeDashoffset = offset;
  }, 100);

  // Animate percentage counter
  animateCounter($('scorePercent'), 0, pct, 1200);

  $('scoreTitle').textContent = `${emoji} Quiz Complete!`;
  $('scoreDetail').textContent = `${correct} of ${questions.length} correct`;
  $('scoreMsg').textContent = msg;

  scoreSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Launch confetti for good scores
  if (pct >= 70) launchConfetti();
}

// ── Animated Counter ──
function animateCounter(el, start, end, duration) {
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);
    el.textContent = `${current}%`;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Confetti Effect ──
function launchConfetti() {
  const canvas = $('confettiCanvas');
  const colors = ['#8b5cf6', '#ec4899', '#22c55e', '#3b82f6', '#eab308', '#f97316'];
  const particles = [];

  for (let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: absolute;
      width: ${Math.random() * 8 + 4}px;
      height: ${Math.random() * 8 + 4}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      left: ${Math.random() * 100}%;
      top: -10px;
      opacity: 0;
      pointer-events: none;
    `;
    canvas.appendChild(particle);
    particles.push({
      el: particle,
      x: Math.random() * 100,
      y: -10,
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 2 + 1,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      opacity: 1,
      delay: Math.random() * 500
    });
  }

  const startTime = performance.now();
  function animate(time) {
    const elapsed = time - startTime;
    let alive = false;

    particles.forEach(p => {
      if (elapsed < p.delay) { alive = true; return; }
      const t = (elapsed - p.delay) / 1000;
      p.y += p.vy;
      p.x += p.vx * 0.3;
      p.rotation += p.rotSpeed;
      p.opacity = Math.max(0, 1 - t * 0.5);

      p.el.style.left = `${p.x}%`;
      p.el.style.top = `${p.y}px`;
      p.el.style.transform = `rotate(${p.rotation}deg)`;
      p.el.style.opacity = p.opacity;

      if (p.opacity > 0 && p.y < 500) alive = true;
    });

    if (alive) requestAnimationFrame(animate);
    else canvas.innerHTML = '';
  }
  requestAnimationFrame(animate);
}

// ── Review Answers (scroll to top of questions) ──
function reviewAnswers() {
  $('scoreSection').style.display = 'none';
  $('questionsContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Reset Everything ──
function resetAll() {
  questions = [];
  answers = {};
  quizData = null;
  currentVideoId = null;

  $('urlInput').value = '';
  $('questionsContainer').innerHTML = '';
  $('topicsStrip').innerHTML = '';
  $('quizSection').style.display = 'none';
  $('loadingSection').style.display = 'none';
  $('scoreSection').style.display = 'none';
  $('heroSection').style.display = 'block';

  // Reset progress
  $('quizProgressFill').style.width = '0%';
  $('quizProgressText').textContent = '0 / 0';

  // Reset score ring
  const ring = $('scoreRing');
  if (ring) ring.style.strokeDashoffset = 326.73;
  const confetti = $('confettiCanvas');
  if (confetti) confetti.innerHTML = '';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Navbar scroll effect ──
let lastScroll = 0;
window.addEventListener('scroll', () => {
  const navbar = $('navbar');
  const scrollY = window.scrollY;
  if (scrollY > 20) {
    navbar.style.background = 'rgba(10, 10, 15, 0.85)';
    navbar.style.backdropFilter = 'blur(16px)';
    navbar.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
    navbar.style.padding = '14px 0';
  } else {
    navbar.style.background = 'transparent';
    navbar.style.backdropFilter = 'none';
    navbar.style.borderBottom = 'none';
    navbar.style.padding = '20px 0';
  }
  lastScroll = scrollY;
});

// ══════════════════════════════════════════
// NOTES MODE — Additional Logic
// ══════════════════════════════════════════

// ── Current Mode ──
let currentMode = 'quiz'; // 'quiz' | 'notes'
let notesData = null;

// ── Mode Toggle ──
function setMode(mode) {
  currentMode = mode;
  const quizOpts = document.querySelector('.input-card__options');

  if (mode === 'quiz') {
    $('modeQuiz').classList.add('active');
    $('modeNotes').classList.remove('active');
    quizOpts.style.display = 'flex';
    $('generateBtnText').textContent = 'Generate Quiz';
  } else {
    $('modeNotes').classList.add('active');
    $('modeQuiz').classList.remove('active');
    quizOpts.style.display = 'none';
    $('generateBtnText').textContent = 'Generate Notes';
  }
}

// ── Override handleGenerate to support notes mode ──
const _originalHandleGenerate = handleGenerate;
window.handleGenerate = async function() {
  if (currentMode === 'notes') {
    await handleGenerateNotes();
  } else {
    await _originalHandleGenerate();
  }
};

// ── Notes Loading Messages ──
function showNotesLoading() {
  $('heroSection').style.display = 'none';
  $('quizSection').style.display = 'none';
  $('notesSection').style.display = 'none';
  $('loadingSection').style.display = 'flex';

  ['ls1', 'ls2', 'ls3'].forEach(id => $(id).className = 'load-step');
  $('ls1').classList.add('active');
  $('progressBar').style.width = '10%';
  $('loadingTitle').textContent = 'Fetching Video Transcript...';
  $('loadingSubtitle').textContent = 'Reading the actual content from the video captions';

  setTimeout(() => {
    $('ls1').className = 'load-step done';
    $('ls2').className = 'load-step active';
    $('progressBar').style.width = '45%';
    $('loadingTitle').textContent = 'AI Analyzing Content...';
    $('loadingSubtitle').textContent = 'Identifying key concepts, definitions, and topics';
  }, 1800);

  setTimeout(() => {
    $('ls2').className = 'load-step done';
    $('ls3').className = 'load-step active';
    $('progressBar').style.width = '78%';
    $('loadingTitle').textContent = 'Structuring Notes...';
    $('loadingSubtitle').textContent = 'Organizing into sections, definitions, and takeaways';
  }, 3600);
}

// ── Generate Notes ──
async function handleGenerateNotes() {
  const url = $('urlInput').value.trim();
  hideError();
  notesData = null;

  if (!url) { showError('Please paste a YouTube URL first.'); return; }

  const videoId = extractVideoId(url);
  if (!videoId) {
    showError('Invalid YouTube URL. Please paste a valid link like https://youtube.com/watch?v=...');
    return;
  }

  const model = $('modelSelect').value;
  $('generateBtn').disabled = true;
  showNotesLoading();

  try {
    const response = await fetch('/api/generate-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to generate notes');

    // Cache hit: Notes are ready immediately
    if (data.cached) {
      if (!data.notes || !data.notes.sections || data.notes.sections.length === 0) {
        throw new Error('No cached notes were found.');
      }
      notesData = data.notes;
      hideLoading();
      renderNotes(data.videoId);
      $('generateBtn').disabled = false;
    } else {
      // Cache miss: Start polling background job
      pollJob(data.jobId, 'notes', data.videoId);
    }

  } catch (e) {
    hideLoading();
    $('heroSection').style.display = 'block';
    showError(e.message || 'Something went wrong. Please try again.');
    $('generateBtn').disabled = false;
  }
}

// ── Render Notes ──
function renderNotes(videoId) {
  $('notesSection').style.display = 'block';
  $('quizSection').style.display = 'none';

  // Video bar
  $('notesVideoThumb').src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  $('notesVideoTitle').textContent = notesData.videoTitle || 'YouTube Video';
  $('notesVideoTopic').textContent = `Topic: ${notesData.topic || 'General'}`;

  // Topics strip
  const topics = notesData.topicsCovered || [];
  $('notesTopicsStrip').innerHTML = topics.map(t => `<span class="topic-chip">${escHtml(t)}</span>`).join('');

  // Summary
  if (notesData.summary) {
    $('notesSummary').innerHTML = `<strong>📋 Overview</strong>${escHtml(notesData.summary)}`;
    $('notesSummary').style.display = 'block';
  }

  // Sections
  const container = $('notesContainer');
  container.innerHTML = '';

  // Prepend Visual Timeline card if present
  if (notesData.timeline && notesData.timeline.length > 0) {
    const timelineCard = document.createElement('div');
    timelineCard.className = 'note-card expanded timeline-card';
    timelineCard.style.animationDelay = '0s';
    timelineCard.innerHTML = `
      <div class="note-card__header">
        <div class="note-card__header-left">
          <div class="note-card__icon">⏱️</div>
          <span class="note-card__title">Visual Timeline</span>
        </div>
      </div>
      <div class="note-card__body">
        <div class="timeline-list" style="display:flex; flex-direction:column; gap:12px; padding:10px 0 10px 10px; border-left:2px solid rgba(139,92,246,0.3); margin-left:10px;">
          ${notesData.timeline.map(item => `
            <div class="timeline-item" style="display:flex; gap:16px; align-items:flex-start; position:relative;">
              <div class="timeline-item__badge" style="font-family:monospace; font-size:11.5px; font-weight:700; color:#c4b5fd; background:rgba(139,92,246,0.15); padding:2px 8px; border-radius:4px; flex-shrink:0;">${escHtml(item.timestamp)}</div>
              <div class="timeline-item__content" style="font-size:13px; color:rgba(232,232,240,0.85); line-height:1.5; padding-top:2px;">${escHtml(item.topic)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    container.appendChild(timelineCard);
  }

  (notesData.sections || []).forEach((section, i) => {
    const card = document.createElement('div');
    card.className = 'note-card' + (i === 0 && (!notesData.timeline || notesData.timeline.length === 0) ? ' expanded' : '');
    card.id = `notecard-${i}`;
    card.style.animationDelay = `${(i + 1) * 0.07}s`;

    const hasBullets = section.bulletPoints && section.bulletPoints.length > 0;
    const hasDefs = section.definitions && section.definitions.length > 0;

    card.innerHTML = `
      <div class="note-card__header" onclick="toggleNoteCard(${i})">
        <div class="note-card__header-left">
          <div class="note-card__icon">${i + 1}</div>
          <span class="note-card__title">${escHtml(section.title || `Section ${i + 1}`)}</span>
        </div>
        <span class="note-card__chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </div>
      <div class="note-card__body">
        ${section.content ? `<p class="note-card__content">${parseMarkdown(section.content)}</p>` : ''}
        ${hasBullets ? `
          <div class="note-section-label">Key Points</div>
          <ul class="note-bullets">
            ${section.bulletPoints.map(bp => `<li>${parseMarkdown(bp)}</li>`).join('')}
          </ul>
        ` : ''}
        ${hasDefs ? `
          <div class="note-section-label">Definitions</div>
          <div class="note-defs">
            ${section.definitions.map(d => `
              <div class="note-def-item">
                <div class="note-def-item__term">${escHtml(d.term)}</div>
                <div class="note-def-item__def">${escHtml(d.definition)}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
    container.appendChild(card);
  });

  // Append Interview Preparation Q&A card if present
  if (notesData.interviewQuestions && notesData.interviewQuestions.length > 0) {
    const interviewCard = document.createElement('div');
    interviewCard.className = 'note-card interview-card';
    interviewCard.id = 'notecard-interview';
    interviewCard.style.animationDelay = `${((notesData.sections || []).length + 1) * 0.07}s`;
    
    interviewCard.innerHTML = `
      <div class="note-card__header" onclick="toggleNoteCard('interview')">
        <div class="note-card__header-left">
          <div class="note-card__icon">💬</div>
          <span class="note-card__title">Interview Preparation Q&A</span>
        </div>
        <span class="note-card__chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </div>
      <div class="note-card__body">
        <div class="interview-list" style="display:flex; flex-direction:column; gap:16px; padding:10px 0;">
          ${notesData.interviewQuestions.map((iq, idx) => `
            <div class="interview-item" style="border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:12px; margin-bottom:4px;">
              <div class="interview-item__q" style="font-size:13.5px; font-weight:700; color:#f472b6; margin-bottom:6px;"><strong>Q${idx + 1}:</strong> ${escHtml(iq.question)}</div>
              <div class="interview-item__a" style="font-size:13px; color:rgba(232,232,240,0.75); line-height:1.6; padding-left:14px; border-left:2px solid rgba(236,72,153,0.4); font-family: 'Inter', sans-serif;"><strong>Answer:</strong> ${escHtml(iq.answer)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    container.appendChild(interviewCard);
  }

  // Key Takeaways
  if (notesData.keyTakeaways && notesData.keyTakeaways.length > 0) {
    const takeaways = $('notesTakeaways');
    takeaways.innerHTML = `
      <div class="notes-takeaways__title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        Key Takeaways
      </div>
      <div class="notes-takeaways__list">
        ${notesData.keyTakeaways.map((t, i) => `
          <div class="notes-takeaways__item">
            <div class="notes-takeaways__num">${i + 1}</div>
            <span>${escHtml(t)}</span>
          </div>
        `).join('')}
      </div>
    `;
    takeaways.style.display = 'block';
  }

  // Glossary
  if (notesData.importantTerms && notesData.importantTerms.length > 0) {
    const glossary = $('notesGlossary');
    glossary.innerHTML = `
      <div class="notes-glossary__title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        Glossary of Terms
      </div>
      <div class="glossary-grid">
        ${notesData.importantTerms.map(t => `
          <div class="glossary-item">
            <span class="glossary-item__term">${escHtml(t.term)}</span>
            <span class="glossary-item__def">${escHtml(t.definition)}</span>
          </div>
        `).join('')}
      </div>
    `;
    glossary.style.display = 'block';
  }

  $('notesSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Toggle Note Card Accordion ──
function toggleNoteCard(i) {
  const card = $(`notecard-${i}`);
  card.classList.toggle('expanded');
}

// ── Download Notes as Premium PDF (html2canvas + jsPDF) ──
async function downloadNotes() {
  if (!notesData) return;

  const btn = $('downloadNotesBtn');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Generating…</span>`;
  btn.disabled = true;

  try {
    // ── Build staging area to measure heights ──
    const staging = document.createElement('div');
    staging.id = '__pdf_staging__';
    staging.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: 682px; /* Content width: 794px - 56px*2 */
      visibility: hidden;
      box-sizing: border-box;
      font-family: 'Inter', sans-serif;
      color: #e8e8f0;
      background: #0a0a0f;
    `;
    document.body.appendChild(staging);

    // Helper: measure heights accurately
    function measureHeight(html) {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      temp.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        display: block;
      `;
      staging.appendChild(temp);
      const h = temp.getBoundingClientRect().height;
      staging.removeChild(temp);
      return h;
    }

    const blocks = [];

    // ── Block: Overview ──
    if (notesData.summary) {
      blocks.push({
        type: 'overview',
        html: `
          <div style="padding:24px 30px; border-radius:12px; background:linear-gradient(135deg,rgba(139,92,246,0.1),rgba(236,72,153,0.04)); border:1px solid rgba(139,92,246,0.2); box-sizing:border-box; width:100%; font-family: 'Inter', sans-serif;">
            <div style="font-size:10px; font-weight:700; letter-spacing:1.2px; color:#a78bfa; text-transform:uppercase; margin-bottom:10px;">📋 Overview</div>
            <p style="font-size:13px; color:rgba(232,232,240,0.75); line-height:1.75; margin:0;">${escHtml(notesData.summary)}</p>
          </div>
        `
      });
    }

    // ── Block: Timeline ──
    if (notesData.timeline && notesData.timeline.length > 0) {
      blocks.push({
        type: 'timeline',
        html: `
          <div style="padding:24px 30px; border-radius:12px; background:rgba(18,18,26,0.75); border:1px solid rgba(255,255,255,0.06); box-sizing:border-box; width:100%; font-family: 'Inter', sans-serif;">
            <div style="font-size:10px; font-weight:700; letter-spacing:1.2px; color:#a78bfa; text-transform:uppercase; margin-bottom:14px; display:flex; align-items:center; gap:6px;">⏱️ Visual Timeline</div>
            <div style="display:flex; flex-direction:column; gap:10px; border-left:1.5px solid rgba(139,92,246,0.3); padding-left:10px; margin-left:6px;">
              ${notesData.timeline.map(item => `
                <div style="display:flex; gap:12px; align-items:flex-start; margin-bottom:4px;">
                  <div style="font-size:10.5px; font-weight:700; color:#c4b5fd; background:rgba(139,92,246,0.15); padding:1px 5px; border-radius:3px; font-family:monospace; flex-shrink:0;">${escHtml(item.timestamp)}</div>
                  <span style="font-size:11.5px; color:rgba(232,232,240,0.8); line-height:1.4;">${escHtml(item.topic)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `
      });
    }

    // ── Blocks: Sections ──
    (notesData.sections || []).forEach((section, idx) => {
      const hasBullets = section.bulletPoints && section.bulletPoints.length > 0;
      const hasDefs = section.definitions && section.definitions.length > 0;

      let inner = `
        <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:16px; font-family: 'Inter', sans-serif;">
          <div style="min-width:26px; height:26px; border-radius:8px; background:linear-gradient(135deg,#8b5cf6,#ec4899); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:white; flex-shrink:0; margin-top:2px;">${idx+1}</div>
          <h2 style="font-size:15px; font-weight:700; color:#e8e8f0; margin:0; line-height:1.4;">
            ${escHtml(section.title || `Section ${idx+1}`)}
          </h2>
        </div>
      `;

      if (section.content) {
        inner += `<div style="font-size:12.5px; color:rgba(232,232,240,0.75); line-height:1.75; margin:0 0 16px; padding-left:38px; font-family: 'Inter', sans-serif;">${parseMarkdown(section.content)}</div>`;
      }

      if (hasBullets) {
        inner += `<div style="margin:0 0 16px; padding-left:38px; font-family: 'Inter', sans-serif;">
          <div style="font-size:9px; font-weight:700; letter-spacing:1.2px; color:#a78bfa; text-transform:uppercase; margin-bottom:8px;">Key Points</div>
          ${section.bulletPoints.map(bp => `
            <div style="display:flex; gap:8px; margin-bottom:6px; align-items:flex-start;">
              <div style="width:5px; height:5px; border-radius:50%; background:linear-gradient(135deg,#8b5cf6,#ec4899); flex-shrink:0; margin-top:6px;"></div>
              <span style="font-size:12px; color:rgba(232,232,240,0.8); line-height:1.6;">${parseMarkdown(bp)}</span>
            </div>
          `).join('')}
        </div>`;
      }

      if (hasDefs) {
        inner += `<div style="margin:0 0 4px; padding-left:38px; font-family: 'Inter', sans-serif;">
          <div style="font-size:9px; font-weight:700; letter-spacing:1.2px; color:#ec4899; text-transform:uppercase; margin-bottom:8px;">Definitions</div>
          ${section.definitions.map(d => `
            <div style="margin-bottom:8px; padding:10px 14px; border-radius:8px; background:rgba(139,92,246,0.06); border-left:2.5px solid rgba(139,92,246,0.45); box-sizing:border-box;">
               <div style="font-size:11.5px; font-weight:700; color:#c4b5fd; margin-bottom:2px;">${escHtml(d.term)}</div>
               <div style="font-size:11.5px; color:rgba(232,232,240,0.65); line-height:1.5;">${escHtml(d.definition)}</div>
            </div>
          `).join('')}
        </div>`;
      }

      blocks.push({
        type: 'section',
        html: `
          <div style="padding:24px 30px; border-radius:12px; background:rgba(18, 18, 26, 0.75); border:1px solid rgba(255, 255, 255, 0.06); box-sizing:border-box; width:100%; font-family: 'Inter', sans-serif;">
            ${inner}
          </div>
        `
      });
    });

    // ── Block: Key Takeaways ──
    if (notesData.keyTakeaways && notesData.keyTakeaways.length > 0) {
      blocks.push({
        type: 'takeaways',
        html: `
          <div style="padding:24px 30px; border-radius:12px; background:linear-gradient(135deg,rgba(245,158,11,0.06),rgba(245,158,11,0.02)); border:1px solid rgba(245,158,11,0.2); box-sizing:border-box; width:100%; font-family: 'Inter', sans-serif;">
            <div style="font-size:10px; font-weight:700; letter-spacing:1.2px; color:#f59e0b; text-transform:uppercase; margin-bottom:14px; display:flex; align-items:center; gap:6px;">⭐ Key Takeaways</div>
            ${notesData.keyTakeaways.map((t, i) => `
              <div style="display:flex; gap:10px; margin-bottom:8px; align-items:flex-start;">
                <div style="min-width:20px; height:20px; border-radius:5px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#f59e0b; flex-shrink:0;">${i+1}</div>
                <span style="font-size:12.5px; color:rgba(232,232,240,0.85); line-height:1.55; padding-top:1px;">${escHtml(t)}</span>
              </div>
            `).join('')}
          </div>
        `
      });
    }

    // ── Blocks: Glossary ──
    if (notesData.importantTerms && notesData.importantTerms.length > 0) {
      blocks.push({
        type: 'glossary-header',
        html: `
          <div style="font-size:10px; font-weight:700; letter-spacing:1.2px; color:#34d399; text-transform:uppercase; margin-top:8px; margin-bottom:2px; width:100%; font-family: 'Inter', sans-serif;">📖 Glossary of Terms</div>
        `
      });

      const terms = notesData.importantTerms;
      for (let i = 0; i < terms.length; i += 2) {
        const t1 = terms[i];
        const t2 = terms[i+1];

        let rowHtml = `
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; width:100%; box-sizing:border-box; font-family: 'Inter', sans-serif;">
            <div style="padding:12px 14px; border-radius:8px; background:rgba(52,211,153,0.04); border:1px solid rgba(52,211,153,0.12); box-sizing:border-box;">
              <div style="font-size:11px; font-weight:700; color:#6ee7b7; margin-bottom:4px;">${escHtml(t1.term)}</div>
              <div style="font-size:11px; color:rgba(232,232,240,0.6); line-height:1.5;">${escHtml(t1.definition)}</div>
            </div>
        `;

        if (t2) {
          rowHtml += `
            <div style="padding:12px 14px; border-radius:8px; background:rgba(52,211,153,0.04); border:1px solid rgba(52,211,153,0.12); box-sizing:border-box;">
              <div style="font-size:11px; font-weight:700; color:#6ee7b7; margin-bottom:4px;">${escHtml(t2.term)}</div>
              <div style="font-size:11px; color:rgba(232,232,240,0.6); line-height:1.5;">${escHtml(t2.definition)}</div>
            </div>
          `;
        } else {
          rowHtml += `<div></div>`;
        }

        rowHtml += `</div>`;

        blocks.push({
          type: 'glossary-row',
          html: rowHtml
        });
      }
    }

    // ── Block: Interview Questions ──
    if (notesData.interviewQuestions && notesData.interviewQuestions.length > 0) {
      blocks.push({
        type: 'interview-questions',
        html: `
          <div style="padding:24px 30px; border-radius:12px; background:linear-gradient(135deg,rgba(236,72,153,0.06),rgba(236,72,153,0.02)); border:1px solid rgba(236,72,153,0.2); box-sizing:border-box; width:100%; font-family: 'Inter', sans-serif;">
            <div style="font-size:10px; font-weight:700; letter-spacing:1.2px; color:#ec4899; text-transform:uppercase; margin-bottom:14px; display:flex; align-items:center; gap:6px;">💬 Interview Preparation Q&A</div>
            ${notesData.interviewQuestions.map((iq, i) => `
              <div style="margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05); box-sizing:border-box;">
                <div style="font-size:12px; font-weight:700; color:#f472b6; margin-bottom:4px;">Q${i+1}: ${escHtml(iq.question)}</div>
                <div style="font-size:11.5px; color:rgba(232,232,240,0.7); line-height:1.5; padding-left:12px; border-left:1.5px solid rgba(236,72,153,0.35); font-family: 'Inter', sans-serif;">Answer: ${escHtml(iq.answer)}</div>
              </div>
            `).join('')}
          </div>
        `
      });
    }

    // ── Pagination Grouping Algorithm ──
    const maxPageHeight = 860; // content height limit inside A4 page template
    const pages = [];
    let currentPageBlocks = [];
    let currentPageHeight = 0;

    blocks.forEach(block => {
      const blockH = measureHeight(block.html);
      // Ensure we add at least one block to prevent infinite loop on extra large blocks
      if (currentPageBlocks.length === 0) {
        currentPageBlocks.push(block.html);
        currentPageHeight = blockH;
      } else {
        // If block fits within page limit (including 16px gap)
        if (currentPageHeight + 16 + blockH <= maxPageHeight) {
          currentPageBlocks.push(block.html);
          currentPageHeight += 16 + blockH;
        } else {
          // Push current page and start a new page
          pages.push(currentPageBlocks);
          currentPageBlocks = [block.html];
          currentPageHeight = blockH;
        }
      }
    });

    if (currentPageBlocks.length > 0) {
      pages.push(currentPageBlocks);
    }

    // Clean up staging area
    document.body.removeChild(staging);

    // ── Compile final PDF pages DOM wrapper ──
    const pdfPagesWrapper = document.createElement('div');
    pdfPagesWrapper.id = '__pdf_pages_wrapper__';
    pdfPagesWrapper.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: 794px;
      background: #0a0a0f;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    `;

    // Page 1: Cover Page
    const coverPage = document.createElement('div');
    coverPage.className = 'pdf-page-render';
    coverPage.style.cssText = `
      width: 794px;
      height: 1123px;
      box-sizing: border-box;
      padding: 80px 56px 60px;
      background: linear-gradient(135deg, #0d0d1a 0%, #12091f 50%, #0a1020 100%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    `;
    coverPage.innerHTML = `
      <div style="position:absolute;top:-80px;right:-80px;width:320px;height:320px;
        border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,0.18) 0%,transparent 70%);pointer-events:none"></div>
      <div style="position:absolute;bottom:-60px;left:-60px;width:260px;height:260px;
        border-radius:50%;background:radial-gradient(circle,rgba(236,72,153,0.12) 0%,transparent 70%);pointer-events:none"></div>

      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#8b5cf6,#ec4899);
          border-radius:10px;display:flex;align-items:center;justify-content:center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </div>
        <span style="font-size:15px;font-weight:700;color:#a78bfa;letter-spacing:0.5px">QuizTube<span style="color:#ec4899">AI</span></span>
      </div>

      <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; margin-top: -40px;">
        <div style="display:inline-block; align-self: flex-start; padding:5px 14px; border-radius:20px;
          background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.35);
          font-size:11px;font-weight:600;color:#a78bfa;letter-spacing:1px;
          text-transform:uppercase;margin-bottom:24px">Study Notes</div>

        <h1 style="font-size:32px;font-weight:800;line-height:1.25;margin:0 0 16px;
          background:linear-gradient(90deg,#ffffff,#c4b5fd);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
          background-clip:text; font-family: 'Inter', sans-serif;">${escHtml(notesData.videoTitle || 'Study Notes')}</h1>

        <p style="font-size:14px;color:#a78bfa;margin:0 0 32px;font-weight:500; font-family: 'Inter', sans-serif;">
          ${escHtml(notesData.topic || '')}
        </p>

        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${(notesData.topicsCovered || []).map(t =>
            `<span style="display:inline-block;padding:4px 12px;
              border-radius:20px;background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.25);
              font-size:11px;color:#c4b5fd;font-weight:500; font-family: 'Inter', sans-serif;">${escHtml(t)}</span>`
          ).join('')}
        </div>
      </div>

      <div style="padding-top:24px;border-top:1px solid rgba(255,255,255,0.07);
        display:flex;justify-content:space-between;align-items:center; font-family: 'Inter', sans-serif;">
        <span style="font-size:11px;color:rgba(255,255,255,0.3)">Generated by QuizTubeAI</span>
        <span style="font-size:11px;color:rgba(255,255,255,0.3)">${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</span>
      </div>
    `;
    pdfPagesWrapper.appendChild(coverPage);

    // Build Content Pages
    const totalPagesCount = pages.length + 1; // Content pages + Cover page

    pages.forEach((pageBlocks, pIdx) => {
      const pageNum = pIdx + 2;
      const contentPage = document.createElement('div');
      contentPage.className = 'pdf-page-render';
      contentPage.style.cssText = `
        width: 794px;
        height: 1123px;
        box-sizing: border-box;
        padding: 48px 56px;
        background: #0a0a0f;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
      `;

      const headerHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:12px; margin-bottom:20px; font-family: 'Inter', sans-serif;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:24px; height:24px; background:linear-gradient(135deg,#8b5cf6,#ec4899); border-radius:6px; display:flex; align-items:center; justify-content:center;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
            <span style="font-size:12px; font-weight:700; color:#a78bfa; letter-spacing:0.5px;">QuizTube<span style="color:#ec4899">AI</span></span>
          </div>
          <span style="font-size:11px; color:rgba(255,255,255,0.45); font-weight:500; max-width:400px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${escHtml(notesData.videoTitle || 'Study Notes')}
          </span>
        </div>
      `;

      const footerHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px; margin-top:20px; font-size:10px; color:rgba(255,255,255,0.3); font-family: 'Inter', sans-serif;">
          <span>QuizTubeAI — AI Study Notes</span>
          <span>Page ${pageNum} of ${totalPagesCount}</span>
        </div>
      `;

      contentPage.innerHTML = `
        ${headerHtml}
        <div style="flex:1; display:flex; flex-direction:column; gap:16px; font-family: 'Inter', sans-serif;">
          ${pageBlocks.join('')}
        </div>
        ${footerHtml}
      `;

      pdfPagesWrapper.appendChild(contentPage);
    });

    document.body.appendChild(pdfPagesWrapper);

    // ── Render each page individually with html2canvas ──
    const renderedPages = pdfPagesWrapper.querySelectorAll('.pdf-page-render');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });

    for (let i = 0; i < renderedPages.length; i++) {
      const pageEl = renderedPages[i];
      const pageCanvas = await html2canvas(pageEl, {
        scale: 2, // High resolution crisp text rendering
        useCORS: true,
        backgroundColor: '#0a0a0f',
        logging: false,
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123
      });

      const pageImg = pageCanvas.toDataURL('image/jpeg', 0.95);

      if (i > 0) {
        doc.addPage();
      }

      // Add as full A4 page: width=210mm, height=297mm
      doc.addImage(pageImg, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }

    // Clean up
    document.body.removeChild(pdfPagesWrapper);

    const safeName = (notesData.videoTitle || 'notes').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`${safeName}_notes.pdf`);

  } catch (err) {
    console.error('PDF generation failed:', err);
    alert('PDF generation failed. Please try again.');
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
}

// ── Patch resetAll to also clear notes ──
const _origResetAll = resetAll;
window.resetAll = function() {
  _origResetAll();
  notesData = null;
  $('notesSection').style.display = 'none';
  $('notesContainer').innerHTML = '';
  $('notesTopicsStrip').innerHTML = '';
  $('notesSummary').innerHTML = '';
  $('notesTakeaways').style.display = 'none';
  $('notesGlossary').style.display = 'none';
};

// ── Markdown Parser Helper ──
function parseMarkdown(text) {
  if (!text) return '';
  // First escape HTML to prevent XSS
  let html = escHtml(text);
  
  // Replace code blocks: ```lang ... ```
  html = html.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)\n```/g, (match, p1) => {
    return `<pre class="code-block" style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:12px; font-family:monospace; font-size:12px; overflow-x:auto; margin:12px 0; color:#a78bfa; box-sizing:border-box; white-space:pre-wrap; word-break:break-all;"><code style="font-family:monospace;">${p1}</code></pre>`;
  });
  
  // Replace inline code: `code`
  html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code" style="background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; font-family:monospace; font-size:11.5px; color:#c4b5fd; border:1px solid rgba(255,255,255,0.03);">$1</code>');
  
  // Replace bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  
  // Replace italic: *text*
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Replace line breaks with br
  html = html.replace(/\n/g, '<br/>');

  return html;
}

// ── Job Polling Loop Helper ──
function pollJob(jobId, mode, videoId) {
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 5;

  const checkStatus = async () => {
    console.log("Polling job:", jobId);
    try {
      const res = await fetch(`/api/job-status/${jobId}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch job status (Server returned ${res.status})`);
      }
      const data = await res.json();
      
      console.log("Received:", {
        status: data.status,
        hasResult: !!data.result
      });

      // Reset failure counter on successful response
      consecutiveFailures = 0;
      
      if (data.status === 'pending') {
        $('progressBar').style.width = '5%';
        $('loadingTitle').textContent = 'Job Pending...';
        $('loadingSubtitle').textContent = 'Waiting in Render worker queue';
        $('ls1').className = 'load-step active';
      } else if (data.status === 'processing') {
        // Map progress check marks dynamically
        if (data.progress < 45) {
          $('ls1').className = 'load-step active';
          $('ls2').className = 'load-step';
          $('ls3').className = 'load-step';
        } else if (data.progress >= 45 && data.progress < 85) {
          $('ls1').className = 'load-step done';
          $('ls2').className = 'load-step active';
          $('ls3').className = 'load-step';
        } else {
          $('ls1').className = 'load-step done';
          $('ls2').className = 'load-step done';
          $('ls3').className = 'load-step active';
        }
        
        $('progressBar').style.width = `${data.progress}%`;
        $('loadingTitle').textContent = data.current_step || 'Processing...';
        
        const remaining = data.estimated_time_remaining || 'Calculating...';
        $('loadingSubtitle').textContent = `Remaining: ${remaining}`;
      } else if (data.status === 'completed') {
        console.log("Completed Job Payload:", data);
        
        if (!data.result) {
          const missingErr = new Error("Job completed but result payload is missing.");
          missingErr.isExplicitJobFailure = true;
          throw missingErr;
        }
        
        if (mode === 'notes') {
          if (!data.result.sections) {
            console.warn("Warning: data.result.sections is missing from completed job payload.");
          }
          if (!data.result.timeline) {
            console.warn("Warning: data.result.timeline is missing from completed job payload.");
          }
        } else if (mode === 'quiz') {
          if (!data.result.questions) {
            console.warn("Warning: data.result.questions is missing from completed job payload.");
          }
        }

        $('progressBar').style.width = '100%';
        ['ls1', 'ls2', 'ls3'].forEach(id => {
          $(id).className = 'load-step done';
        });
        
        setTimeout(() => {
          hideLoading();
          if (mode === 'quiz') {
            quizData = data.result;
            questions = data.result.questions;
            renderQuiz(videoId);
          } else {
            notesData = data.result;
            renderNotes(videoId);
          }
          $('generateBtn').disabled = false;
        }, 500);
        
        return; // stop polling loop
      } else if (data.status === 'failed') {
        // Explicit backend failure: throw error to be handled in catch block
        const errorMsg = data.error || 'Job failed';
        const explicitErr = new Error(errorMsg);
        explicitErr.isExplicitJobFailure = true;
        throw explicitErr;
      }
      
      // Keep polling every 2 seconds
      setTimeout(checkStatus, 2000);
      
    } catch (err) {
      if (err.isExplicitJobFailure) {
        // If the backend marked the job as failed, abort immediately
        hideLoading();
        $('heroSection').style.display = 'block';
        showError(err.message);
        $('generateBtn').disabled = false;
        return;
      }
      
      consecutiveFailures++;
      console.warn(`[Poll] Temporary fetch failure (${consecutiveFailures}/${maxConsecutiveFailures}):`, err.message);
      
      if (consecutiveFailures >= maxConsecutiveFailures) {
        // Exceeded maximum retries, fail the UI
        hideLoading();
        $('heroSection').style.display = 'block';
        showError('Connection to server lost. Please check your internet or try again later.');
        $('generateBtn').disabled = false;
      } else {
        // Retry polling after a 3-second delay
        setTimeout(checkStatus, 3000);
      }
    }
  };
  
  // Start polling
  setTimeout(checkStatus, 1000);
}