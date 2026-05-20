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
      body: JSON.stringify({ url, qCount: parseInt(qCount), difficulty, model })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate quiz');
    }

    if (!data.quiz || !data.quiz.questions || data.quiz.questions.length === 0) {
      throw new Error('No questions were generated. Try a different video.');
    }

    quizData = data.quiz;
    questions = data.quiz.questions;
    hideLoading();
    renderQuiz(data.videoId);

  } catch (e) {
    hideLoading();
    $('heroSection').style.display = 'block';
    showError(e.message || 'Something went wrong. Please try again.');
  } finally {
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
      body: JSON.stringify({ url, model })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to generate notes');
    if (!data.notes || !data.notes.sections || data.notes.sections.length === 0)
      throw new Error('No notes were generated. Try a different video.');

    notesData = data.notes;
    hideLoading();
    renderNotes(data.videoId);

  } catch (e) {
    hideLoading();
    $('heroSection').style.display = 'block';
    showError(e.message || 'Something went wrong. Please try again.');
  } finally {
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

  (notesData.sections || []).forEach((section, i) => {
    const card = document.createElement('div');
    card.className = 'note-card' + (i === 0 ? ' expanded' : '');
    card.id = `notecard-${i}`;
    card.style.animationDelay = `${i * 0.07}s`;

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
        ${section.content ? `<p class="note-card__content">${escHtml(section.content)}</p>` : ''}
        ${hasBullets ? `
          <div class="note-section-label">Key Points</div>
          <ul class="note-bullets">
            ${section.bulletPoints.map(bp => `<li>${escHtml(bp)}</li>`).join('')}
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

// ── Download Notes as Text ──
function downloadNotes() {
  if (!notesData) return;
  let text = `# ${notesData.videoTitle || 'Study Notes'}\n`;
  text += `Topic: ${notesData.topic || ''}\n`;
  text += `\n## Overview\n${notesData.summary || ''}\n`;

  (notesData.sections || []).forEach((s, i) => {
    text += `\n## ${i + 1}. ${s.title}\n`;
    if (s.content) text += `${s.content}\n`;
    if (s.bulletPoints?.length) {
      text += '\nKey Points:\n';
      s.bulletPoints.forEach(bp => text += `  • ${bp}\n`);
    }
    if (s.definitions?.length) {
      text += '\nDefinitions:\n';
      s.definitions.forEach(d => text += `  ${d.term}: ${d.definition}\n`);
    }
  });

  if (notesData.keyTakeaways?.length) {
    text += '\n## Key Takeaways\n';
    notesData.keyTakeaways.forEach((t, i) => text += `${i + 1}. ${t}\n`);
  }

  if (notesData.importantTerms?.length) {
    text += '\n## Glossary\n';
    notesData.importantTerms.forEach(t => text += `${t.term}: ${t.definition}\n`);
  }

  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(notesData.videoTitle || 'notes').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
  a.click();
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