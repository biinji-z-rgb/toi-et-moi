const socket = io();

// ---------- Navigation entre ecrans ----------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ---------- Etat local ----------
let myName = '';
let pendingLocation = null; // 'home' | 'away'
let currentIndex = -1;
let currentTotal = 15;
let currentItemType = 'question';

// ---------- Gestion du lien de session dans l'URL ----------
const urlParams = new URLSearchParams(window.location.search);
const codeFromUrl = urlParams.get('code');
if (codeFromUrl) {
  document.getElementById('code-input').value = codeFromUrl.toUpperCase();
}

// ---------- Ecran accueil ----------
document.getElementById('btn-create').addEventListener('click', () => {
  const name = document.getElementById('name-input').value.trim();
  if (!name) {
    setError('home-error', 'Dis-nous comment on t\'appelle avant de continuer.');
    return;
  }
  myName = name;
  setError('home-error', '');
  showScreen('screen-location');
});

document.getElementById('btn-join').addEventListener('click', () => {
  const name = document.getElementById('name-input').value.trim();
  const code = document.getElementById('code-input').value.trim().toUpperCase();
  if (!name) {
    setError('home-error', 'Dis-nous comment on t\'appelle avant de continuer.');
    return;
  }
  if (!code) {
    setError('home-error', 'Entre le code de session partagé par ton/ta partenaire.');
    return;
  }
  myName = name;
  setError('home-error', '');
  socket.emit('joinSession', { name, code });
});

// ---------- Ecran choix du lieu (createur uniquement) ----------
document.querySelectorAll('.location-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    pendingLocation = btn.dataset.location;
    socket.emit('createSession', { name: myName, location: pendingLocation });
  });
});

// ---------- Salle d'attente ----------
socket.on('sessionCreated', ({ code, players }) => {
  renderWaitingRoom(code, players, pendingLocation);
  showScreen('screen-waiting');
});

socket.on('sessionJoined', ({ code, players, location }) => {
  renderWaitingRoom(code, players, location);
  showScreen('screen-waiting');
});

socket.on('playersUpdated', ({ players }) => {
  const list = document.getElementById('players-list');
  list.innerHTML = players.map((p) => `<li>💛 ${escapeHtml(p.name)}</li>`).join('');
  const startBtn = document.getElementById('btn-start');
  const hint = document.getElementById('waiting-hint');
  if (players.length >= 2) {
    startBtn.disabled = false;
    hint.textContent = 'Vous êtes prêts ! Un(e) des deux peut lancer la partie.';
  } else {
    startBtn.disabled = true;
    hint.textContent = 'En attente de ton/ta partenaire…';
  }
});

function renderWaitingRoom(code, players, location) {
  document.getElementById('session-code').textContent = code.split('').join(' ');
  document.getElementById('waiting-location-label').textContent =
    location === 'home' ? '— à la maison 🏠' : '— en dehors de la maison 🌆';

  const list = document.getElementById('players-list');
  list.innerHTML = players.map((p) => `<li>💛 ${escapeHtml(p.name)}</li>`).join('');

  const startBtn = document.getElementById('btn-start');
  const hint = document.getElementById('waiting-hint');
  if (players.length >= 2) {
    startBtn.disabled = false;
    hint.textContent = 'Vous êtes prêts ! Un(e) des deux peut lancer la partie.';
  } else {
    startBtn.disabled = true;
    hint.textContent = 'En attente de ton/ta partenaire…';
  }

  const joinUrl = `${window.location.origin}${window.location.pathname}?code=${code}`;
  const canvas = document.getElementById('qr-canvas');
  const fallbackNote = document.getElementById('qr-fallback-note');

  if (window.QRCode && canvas) {
    QRCode.toCanvas(canvas, joinUrl, { width: 200, margin: 1, color: { dark: '#24070d', light: '#f7ece3' } }, (err) => {
      if (err) {
        console.error('Erreur génération QR code:', err);
        canvas.style.display = 'none';
        fallbackNote.textContent = 'Le QR code n\\'a pas pu être généré, utilise le lien ci-dessous.';
      } else {
        fallbackNote.textContent = '';
      }
    });
  } else {
    canvas.style.display = 'none';
    fallbackNote.textContent = 'QR code indisponible, utilise le lien ci-dessous.';
  }

  const copyBtn = document.getElementById('btn-copy-link');
  const copyFeedback = document.getElementById('copy-feedback');
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      copyFeedback.textContent = 'Lien copié ✓';
      setTimeout(() => { copyFeedback.textContent = ''; }, 2500);
    }).catch(() => {
      copyFeedback.textContent = joinUrl;
    });
  };
}

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('startGame');
});

// ---------- Erreurs generiques ----------
socket.on('errorMessage', ({ message }) => {
  setError('home-error', message);
  setError('location-error', message);
});

socket.on('partnerLeft', () => {
  alert('Ton/ta partenaire a quitté la session. La partie est terminée.');
  window.location.href = window.location.pathname;
});

function setError(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Ecran de jeu ----------
const LEVEL_LABELS = {
  light: 'Léger',
  medium: 'Complice',
  hot: 'Hot',
  'very-hot': 'Très hot',
  'ultra-hot': 'Ultra hot',
};
const LEVEL_HEAT = {
  light: 12,
  medium: 35,
  hot: 60,
  'very-hot': 82,
  'ultra-hot': 100,
};

socket.on('gameStarted', ({ totalQuestions }) => {
  currentTotal = totalQuestions;
  showScreen('screen-game');
});

socket.on('newItem', ({ index, total, item }) => {
  currentIndex = index;
  currentTotal = total;
  currentItemType = item.type;

  document.getElementById('reveal-card').classList.add('hidden');
  document.getElementById('item-card').classList.remove('hidden');

  const badge = document.getElementById('item-badge');
  badge.className = 'item-badge level-' + item.level + (item.type === 'challenge' ? ' type-challenge' : '');
  if (item.type === 'challenge') {
    const modeLabel = item.mode === 'duo' ? 'Défi à deux' : 'Défi solo · preuve à envoyer';
    badge.textContent = `${modeLabel} · ${LEVEL_LABELS[item.level]}`;
  } else {
    badge.textContent = LEVEL_LABELS[item.level];
  }

  document.getElementById('item-text').textContent = item.text;

  document.getElementById('progress-fill').style.width = `${((index + 1) / total) * 100}%`;
  document.getElementById('progress-label').textContent = `${item.type === 'challenge' ? 'Défi' : 'Question'} ${index + 1} / ${total}`;
  document.getElementById('heat-fill').style.width = `${LEVEL_HEAT[item.level]}%`;

  if (item.type === 'challenge') {
    document.getElementById('question-zone').classList.add('hidden');
    document.getElementById('challenge-zone').classList.remove('hidden');
    document.getElementById('waiting-challenge-hint').textContent = '';
    document.getElementById('btn-confirm-challenge').disabled = false;
    document.getElementById('btn-skip-challenge').disabled = false;
    document.getElementById('challenge-instruction').textContent =
      item.mode === 'duo'
        ? 'Relevez ce défi tous les deux, ensemble, puis confirmez chacun votre côté.'
        : "Réalise ce défi seul(e) et envoie la preuve (photo, message ou vocal) à ton/ta partenaire par vos moyens habituels, puis confirme ici.";
  } else {
    document.getElementById('challenge-zone').classList.add('hidden');
    document.getElementById('question-zone').classList.remove('hidden');
    document.getElementById('answer-input').value = '';
    document.getElementById('answer-input').disabled = false;
    document.getElementById('btn-submit-answer').disabled = false;
    document.getElementById('waiting-answer-hint').textContent = '';
  }
});

document.getElementById('btn-submit-answer').addEventListener('click', () => {
  const input = document.getElementById('answer-input');
  const answer = input.value.trim();
  if (!answer) return;
  socket.emit('submitAnswer', { answer });
  input.disabled = true;
  document.getElementById('btn-submit-answer').disabled = true;
  document.getElementById('waiting-answer-hint').textContent = 'Réponse envoyée. En attente de ton/ta partenaire…';
});

socket.on('partnerAnswered', ({ name }) => {
  const hint = document.getElementById('waiting-answer-hint');
  if (hint) hint.textContent = `${name} a répondu. À toi de valider ta réponse.`;
});

document.getElementById('btn-confirm-challenge').addEventListener('click', () => {
  socket.emit('challengeDone');
  document.getElementById('btn-confirm-challenge').disabled = true;
  document.getElementById('btn-skip-challenge').disabled = true;
  document.getElementById('waiting-challenge-hint').textContent = 'Confirmé. En attente de ton/ta partenaire…';
});

document.getElementById('btn-skip-challenge').addEventListener('click', () => {
  if (!confirm("Passer ce défi ? Mettez-vous d'accord à l'oral sur un gage à réaliser à la place.")) return;
  socket.emit('skipChallenge');
  document.getElementById('btn-confirm-challenge').disabled = true;
  document.getElementById('btn-skip-challenge').disabled = true;
});

socket.on('partnerConfirmedChallenge', ({ name }) => {
  const hint = document.getElementById('waiting-challenge-hint');
  if (hint) hint.textContent = `${name} a confirmé le défi.`;
});

socket.on('challengeCompleted', () => {
  const revealCard = document.getElementById('reveal-card');
  document.getElementById('item-card').classList.add('hidden');
  revealCard.classList.remove('hidden');
  document.getElementById('reveal-answers').innerHTML =
    '<p class="muted">Défi relevé avec succès, bravo à vous deux 🔥</p>';
  document.getElementById('btn-confirm-challenge').disabled = false;
  document.getElementById('btn-skip-challenge').disabled = false;
});

socket.on('challengeSkipped', () => {
  const revealCard = document.getElementById('reveal-card');
  document.getElementById('item-card').classList.add('hidden');
  revealCard.classList.remove('hidden');
  document.getElementById('reveal-answers').innerHTML =
    "<p class=\"muted\">Défi passé — mettez-vous d'accord à l'oral sur un gage 🤝</p>";
  document.getElementById('btn-confirm-challenge').disabled = false;
  document.getElementById('btn-skip-challenge').disabled = false;
});

socket.on('revealAnswers', ({ answers }) => {
  const revealCard = document.getElementById('reveal-card');
  document.getElementById('item-card').classList.add('hidden');
  revealCard.classList.remove('hidden');
  document.getElementById('reveal-answers').innerHTML = answers
    .map((a) => `<div class="reveal-answer"><strong>${escapeHtml(a.name)}</strong>${escapeHtml(a.answer)}</div>`)
    .join('');
});

document.getElementById('btn-next').addEventListener('click', () => {
  socket.emit('nextQuestion');
});

// ---------- Fin de partie ----------
socket.on('gameFinished', ({ summary }) => {
  const container = document.getElementById('summary-list');
  container.innerHTML = summary
    .map((row) => {
      if (row.item.type === 'challenge') {
        const status = row.skipped ? "Défi passé — gage convenu à l'oral 🤝" : 'Défi relevé ✅';
        return `<div class="summary-item">
          <p class="item-text">${escapeHtml(row.item.text)}</p>
          <p class="muted">${status}</p>
        </div>`;
      }
      const answersHtml = (row.answers || [])
        .map((a) => `<div class="reveal-answer"><strong>${escapeHtml(a.name)}</strong>${escapeHtml(a.answer || '')}</div>`)
        .join('');
      return `<div class="summary-item">
        <p class="item-text">${escapeHtml(row.item.text)}</p>
        ${answersHtml}
      </div>`;
    })
    .join('');
  showScreen('screen-end');
});

document.getElementById('btn-restart').addEventListener('click', () => {
  window.location.href = window.location.pathname;
});
